"""Tests de VRAIE concurrence (connexions DB séparées, `TransactionTestCase`,
même pattern que `test_concurrency.py`) pour le système de pénalités :
double prélèvement simultané, cotisation concurrente d'un prélèvement de
pénalité (ordre canonique des verrous Wallet -> TourTontine -> Penalite),
et recontrôle sous verrou contre une cotisation qui vient de committer.
"""
import threading
from datetime import timedelta
from decimal import Decimal
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.db import connections
from django.test import TransactionTestCase, override_settings
from django.urls import reverse
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from apps.authn.models import User
from apps.tontine.models import Penalite, Tontine, TontineMembre, TontineRegle, TourTontine
from apps.tontine.services.penalties_service import PenaliteDejaTraiteeError, tenter_prelevement
from apps.utils.utilitaires import _unique_ref
from apps.wallet.models import Transaction, Wallet

CUTOFF = timezone.make_aware(timezone.datetime(2020, 1, 1))
COTISER_URL = reverse("tontine-cotiser")


def _user(username: str, phone: str) -> User:
    return User.objects.create_user(
        username=username, password="testpass123", code_pin="1234", numero_telephone=phone
    )


def _debit_reussi(tour, user, montant):
    wallet, _ = Wallet.objects.get_or_create(user=user)
    Transaction.objects.create(
        wallet=wallet,
        tontine=tour.tontine,
        tour=tour,
        solde_courant=wallet.solde_courant,
        ref_transaction=_unique_ref("DEB"),
        client_ref=f"cot:{tour.pk}:{user.pk}",
        mode_de_paiement=Transaction.MODE_DE_PAIEMENT.SOLDE_COTICI,
        montant_transaction=montant,
        statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
        type_transaction=Transaction.TYPE_TRANSACTION.DEBIT,
    )


class ConcurrentDoublePrelevementRaceTests(TransactionTestCase):
    """Deux exécutions concurrentes de `tenter_prelevement` sur la MÊME
    pénalité (ex. le job de recouvrement tourne deux fois en parallèle par
    erreur de configuration cron) : une seule doit débiter, l'autre doit
    échouer proprement (`PenaliteDejaTraiteeError`) — jamais un double débit."""

    reset_sequences = False

    def setUp(self):
        self.host = _user("race_pen_host", "22507081000")
        self.member2 = _user("race_pen_mem2", "22507081001")
        self.tontine = Tontine.objects.create(
            hote=self.host,
            type_tontine=Tontine.TYPE_TONTINE.GROUPE,
            description="Course pénalités",
            qr_code="qr-race-pen",
        )
        self.regle = TontineRegle.objects.create(
            tontine=self.tontine,
            objectif_cotisation=20000,
            montant_cotisation=1000,
            montant_penalite=300,
            nombre_max=2,
            nombre_tours=2,
            ordre_ramassage=TontineRegle.ORDRE_RAMASSAGE.DEFINI_PAR_ADMIN,
            frequence=TontineRegle.FREQUENCE_COTISATION.MENSUEL,
        )
        TontineMembre.objects.create(
            tontine=self.tontine,
            membre=self.host,
            role_membre=TontineMembre.ROLE_MEMBRE.ADMIN,
            statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
            ordre_ramassage=1,
        )
        TontineMembre.objects.create(
            tontine=self.tontine,
            membre=self.member2,
            role_membre=TontineMembre.ROLE_MEMBRE.PARTICIPANT,
            statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
            ordre_ramassage=2,
        )
        self.tour = TourTontine.objects.create(
            tontine=self.tontine,
            user=self.host,
            numero_du_tour=1,
            montant_depose=Decimal("0"),
            statut_tour=TourTontine.STATUT_TOUR.TERMINE,
        )
        self.penalite = Penalite.objects.create(
            tontine=self.tontine,
            user=self.member2,
            tour=self.tour,
            montant_penalite=Decimal("300"),
            montant_due=Decimal("300"),
            type_penalite=Penalite.TYPE_PENALITE.RETARD_PAIEMENT,
            est_automatique=True,
        )
        Wallet.objects.create(user=self.member2, solde_courant=Decimal("1000"))
        Wallet.objects.create(user=self.host, solde_courant=Decimal("0"))

    def test_un_seul_debit_gagne_la_course(self):
        results = []
        results_lock = threading.Lock()
        barrier = threading.Barrier(2)

        def _fire():
            try:
                try:
                    barrier.wait(timeout=5)
                except threading.BrokenBarrierError:
                    pass
                try:
                    resultat = tenter_prelevement(self.penalite, now=timezone.now())
                    with results_lock:
                        results.append(("ok", resultat.statut))
                except PenaliteDejaTraiteeError:
                    with results_lock:
                        results.append(("deja_traitee", None))
            except Exception as exc:  # pragma: no cover - diagnostic uniquement
                with results_lock:
                    results.append(("error", repr(exc)))
            finally:
                connections.close_all()

        threads = [threading.Thread(target=_fire) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=10)

        self.assertEqual(len(results), 2)
        outcomes = sorted(r[0] for r in results)
        # Soit l'un gagne ("ok") et l'autre trouve la pénalité déjà traitée,
        # soit (très improbable mais acceptable) les deux constatent un solde
        # insuffisant faute de synchronisation parfaite — jamais deux "ok"
        # avec un statut REGLEE chacun (double débit).
        nb_reglees = sum(1 for r in results if r == ("ok", "reglee"))
        self.assertLessEqual(nb_reglees, 1, f"Double débit détecté : {results}")

        self.assertEqual(
            Transaction.objects.filter(type_transaction=Transaction.TYPE_TRANSACTION.PENALITE).count(),
            1,
        )
        self.assertEqual(
            Transaction.objects.filter(
                type_transaction=Transaction.TYPE_TRANSACTION.VERSEMENT_PENALITE
            ).count(),
            1,
        )
        self.member2_wallet_final = Wallet.objects.get(user=self.member2).solde_courant
        self.assertEqual(self.member2_wallet_final, Decimal("700"))
        self.assertGreaterEqual(Wallet.objects.get(user=self.member2).solde_courant, Decimal("0"))


class ConcurrentCotisationAndPrelevementTests(TransactionTestCase):
    """`cotiser_tontine` (verrouille Wallet -> TourTontine) et
    `tenter_prelevement` (verrouille Wallet fautif -> TourTontine -> Wallet
    bénéficiaire -> Penalite) lancés en parallèle sur le MÊME membre, pour
    DEUX tours distincts de la même tontine (donc deux verrous `TourTontine`
    différents, mais un verrou `Wallet` PARTAGÉ) : ordre canonique
    Wallet -> TourTontine respecté des deux côtés -> aucun deadlock, quel que
    soit l'ordre d'arrivée, et le résultat final est cohérent (solde jamais
    négatif, aucune écriture perdue)."""

    reset_sequences = False

    def setUp(self):
        self.host = _user("race_mix_host", "22507081010")
        self.member2 = _user("race_mix_mem2", "22507081011")
        self.tontine = Tontine.objects.create(
            hote=self.host,
            type_tontine=Tontine.TYPE_TONTINE.GROUPE,
            description="Course mixte pénalité/cotisation",
            qr_code="qr-race-mix",
        )
        self.regle = TontineRegle.objects.create(
            tontine=self.tontine,
            objectif_cotisation=40000,
            montant_cotisation=1000,
            montant_penalite=300,
            nombre_max=2,
            nombre_tours=2,
            ordre_ramassage=TontineRegle.ORDRE_RAMASSAGE.DEFINI_PAR_ADMIN,
            frequence=TontineRegle.FREQUENCE_COTISATION.MENSUEL,
        )
        # `member2` est rang 1 (donc `next_member_to_pay` pour `tour_courant`,
        # qui n'a encore aucun débit) : l'ordre de ramassage détermine qui
        # peut cotiser MAINTENANT, indépendamment du bénéficiaire du tour.
        TontineMembre.objects.create(
            tontine=self.tontine,
            membre=self.member2,
            role_membre=TontineMembre.ROLE_MEMBRE.PARTICIPANT,
            statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
            ordre_ramassage=1,
        )
        TontineMembre.objects.create(
            tontine=self.tontine,
            membre=self.host,
            role_membre=TontineMembre.ROLE_MEMBRE.ADMIN,
            statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
            ordre_ramassage=2,
        )
        # Tour 1 (déjà TERMINÉ) porte la pénalité impayée du membre.
        self.tour_penalite = TourTontine.objects.create(
            tontine=self.tontine,
            user=self.host,
            numero_du_tour=1,
            montant_depose=Decimal("0"),
            statut_tour=TourTontine.STATUT_TOUR.TERMINE,
        )
        self.penalite = Penalite.objects.create(
            tontine=self.tontine,
            user=self.member2,
            tour=self.tour_penalite,
            montant_penalite=Decimal("300"),
            montant_due=Decimal("300"),
            type_penalite=Penalite.TYPE_PENALITE.RETARD_PAIEMENT,
            est_automatique=True,
        )
        # Tour 2 EN_COURS : le membre doit encore cotiser.
        self.tour_courant = TourTontine.objects.create(
            tontine=self.tontine,
            user=self.member2,
            numero_du_tour=2,
            montant_depose=Decimal("0"),
            statut_tour=TourTontine.STATUT_TOUR.EN_COURS,
        )
        # Solde suffisant pour couvrir la cotisation (1000) ET la pénalité
        # (300) même en cas d'exécution strictement séquentielle.
        Wallet.objects.create(user=self.member2, solde_courant=Decimal("1300"))
        Wallet.objects.create(user=self.host, solde_courant=Decimal("0"))

    def test_aucun_deadlock_et_resultat_coherent(self):
        results = []
        results_lock = threading.Lock()
        barrier = threading.Barrier(2)

        def _cotiser():
            try:
                client = APIClient()
                client.force_authenticate(user=self.member2)
                try:
                    barrier.wait(timeout=5)
                except threading.BrokenBarrierError:
                    pass
                response = client.post(
                    COTISER_URL,
                    {"tontine_id": self.tontine.id, "montant": 1000},
                    format="json",
                )
                with results_lock:
                    results.append(("cotisation", response.status_code))
            except Exception as exc:  # pragma: no cover - diagnostic uniquement
                with results_lock:
                    results.append(("cotisation_error", repr(exc)))
            finally:
                # `finally` impératif : une connexion de thread non fermée
                # (même après une exception) laisse une session ouverte qui
                # ferait deadlocker le `flush()` de teardown avec le TRUNCATE
                # multi-tables de `TransactionTestCase`.
                connections.close_all()

        def _prelever():
            try:
                try:
                    barrier.wait(timeout=5)
                except threading.BrokenBarrierError:
                    pass
                try:
                    resultat = tenter_prelevement(self.penalite, now=timezone.now())
                    with results_lock:
                        results.append(("prelevement", resultat.statut))
                except PenaliteDejaTraiteeError:
                    with results_lock:
                        results.append(("prelevement", "deja_traitee"))
            except Exception as exc:  # pragma: no cover - diagnostic uniquement
                with results_lock:
                    results.append(("prelevement_error", repr(exc)))
            finally:
                connections.close_all()

        threads = [threading.Thread(target=_cotiser), threading.Thread(target=_prelever)]
        for t in threads:
            t.start()
        # `join` avec timeout : si un deadlock survenait, ce test resterait
        # bloqué jusqu'au timeout du thread plutôt que de planter
        # immédiatement — la présence des DEUX résultats dans `results`
        # ci-dessous est la preuve qu'aucun deadlock ne s'est produit.
        for t in threads:
            t.join(timeout=15)

        self.assertEqual(len(results), 2, f"Deadlock suspect : résultats obtenus {results}")

        cotisation_status = next(s for k, s in results if k == "cotisation")
        self.assertEqual(cotisation_status, status.HTTP_201_CREATED)

        self.penalite.refresh_from_db()
        self.assertTrue(self.penalite.est_reglee)

        # Solde jamais négatif, quel que soit l'ordre d'exécution effectif.
        member2_solde = Wallet.objects.get(user=self.member2).solde_courant
        self.assertGreaterEqual(member2_solde, Decimal("0"))
        self.assertEqual(member2_solde, Decimal("0"))  # 1300 - 1000 (cotisation) - 300 (pénalité)


@override_settings(PENALITES_AUTO_CUTOFF=CUTOFF)
class RecontroleSousVerrouTests(TransactionTestCase):
    """Démontre que `constater_penalite` ne se fie JAMAIS à la liste de
    candidats pré-calculée par le job (hors verrou) : si un paiement commite
    entre le listing et l'acquisition du verrou sur le tour, le recontrôle
    fait sous `select_for_update()` l'empêche d'être pénalisé — même si le
    job l'avait initialement identifié comme en retard."""

    reset_sequences = False

    def setUp(self):
        self.host = _user("race_recheck_host", "22507081020")
        self.tontine = Tontine.objects.create(
            hote=self.host,
            type_tontine=Tontine.TYPE_TONTINE.GROUPE,
            description="Recontrôle sous verrou",
            qr_code="qr-race-recheck",
        )
        self.regle = TontineRegle.objects.create(
            tontine=self.tontine,
            objectif_cotisation=8000,
            montant_cotisation=1000,
            montant_penalite=300,
            nombre_max=2,
            nombre_tours=2,
            delai_grace_heures=24,
            penalites_automatiques=True,
            ordre_ramassage=TontineRegle.ORDRE_RAMASSAGE.DEFINI_PAR_ADMIN,
            frequence=TontineRegle.FREQUENCE_COTISATION.MENSUEL,
        )
        TontineMembre.objects.create(
            tontine=self.tontine,
            membre=self.host,
            role_membre=TontineMembre.ROLE_MEMBRE.ADMIN,
            statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
            ordre_ramassage=1,
        )
        self.now = timezone.now()
        self.tour = TourTontine.objects.create(
            tontine=self.tontine,
            user=self.host,
            numero_du_tour=1,
            montant_depose=Decimal("0"),
            statut_tour=TourTontine.STATUT_TOUR.EN_COURS,
        )
        TourTontine.objects.filter(pk=self.tour.pk).update(
            date_echeance=self.now - timedelta(days=2), date=self.now - timedelta(days=32)
        )
        self.tour.refresh_from_db()

    def test_paiement_juste_avant_le_verrou_empeche_la_penalite(self):
        from apps.tontine.management.commands import apply_tontine_penalties as cmd_module

        original_constater = cmd_module.constater_penalite

        def _constater_avec_paiement_concurrent(tour, user, regle, *, now):
            # Simule : le job a listé ce (tour, user) comme candidat en
            # retard, PUIS — juste avant que `constater_penalite` n'acquière
            # son verrou sur le tour — le membre paie sa cotisation (commit
            # réel, connexion séparée pour un vrai scénario inter-process).
            done = threading.Event()

            def _payer():
                try:
                    _debit_reussi(tour, user, regle.montant_cotisation)
                finally:
                    # `finally` : même si `_debit_reussi` échoue, on ferme la
                    # connexion et on débloque le thread principal plutôt que
                    # de laisser une session traînante qui ferait deadlocker
                    # le `flush()` de teardown de `TransactionTestCase` avec
                    # une autre requête (TRUNCATE) plus tard.
                    connections.close_all()
                    done.set()

            t = threading.Thread(target=_payer)
            t.start()
            done.wait(timeout=5)
            t.join(timeout=5)
            return original_constater(tour, user, regle, now=now)

        with patch(
            "apps.tontine.management.commands.apply_tontine_penalties.constater_penalite",
            side_effect=_constater_avec_paiement_concurrent,
        ):
            call_command("apply_tontine_penalties", phase="constat", stdout=StringIO())

        self.assertEqual(Penalite.objects.count(), 0)
        self.assertTrue(
            Transaction.objects.filter(
                tour=self.tour, type_transaction=Transaction.TYPE_TRANSACTION.DEBIT
            ).exists()
        )
