"""Tests d'intégration pour le job `apply_tontine_penalties` (phases constat
et recouvrement) : idempotence, garde-fous globaux (`tontine.etat`, cache
`date_echeance` divergent), anti-thrashing, `--dry-run`, résilience aux
`IntegrityError`.
"""
from datetime import timedelta
from decimal import Decimal
from io import StringIO
from unittest.mock import patch

from django.core.management import call_command
from django.db import IntegrityError
from django.test import TestCase, override_settings
from django.utils import timezone

from apps.authn.models import User
from apps.tontine.models import Penalite, Tontine, TontineMembre, TontineRegle, TourTontine
from apps.wallet.models import Transaction, Wallet

CUTOFF = timezone.make_aware(timezone.datetime(2020, 1, 1))


def _user(suffix: str) -> User:
    return User.objects.create_user(
        username=f"pen_job_{suffix}",
        password="testpass123",
        code_pin="1234",
        numero_telephone=f"22507400{suffix}",
    )


def _tontine_avec_regle(
    host,
    *,
    nombre_max=2,
    montant_cotisation=Decimal("1000"),
    montant_penalite=Decimal("300"),
    delai_grace_heures=24,
    penalites_automatiques=True,
    etat=Tontine.ETAT.ACTIF,
):
    tontine = Tontine.objects.create(
        hote=host,
        type_tontine=Tontine.TYPE_TONTINE.GROUPE,
        description="Tontine job pénalités",
        qr_code="qr-pen-job",
        etat=etat,
    )
    regle = TontineRegle.objects.create(
        tontine=tontine,
        objectif_cotisation=montant_cotisation * nombre_max * nombre_max,
        montant_cotisation=montant_cotisation,
        montant_penalite=montant_penalite,
        nombre_max=nombre_max,
        nombre_tours=nombre_max,
        delai_grace_heures=delai_grace_heures,
        penalites_automatiques=penalites_automatiques,
        ordre_ramassage=TontineRegle.ORDRE_RAMASSAGE.DEFINI_PAR_ADMIN,
        frequence=TontineRegle.FREQUENCE_COTISATION.MENSUEL,
    )
    TontineMembre.objects.create(
        tontine=tontine,
        membre=host,
        role_membre=TontineMembre.ROLE_MEMBRE.ADMIN,
        statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
        ordre_ramassage=1,
    )
    return tontine, regle


def _add_member(tontine, user, ordre):
    return TontineMembre.objects.create(
        tontine=tontine,
        membre=user,
        role_membre=TontineMembre.ROLE_MEMBRE.PARTICIPANT,
        statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
        ordre_ramassage=ordre,
    )


def _make_tour(tontine, beneficiaire, numero, *, date_echeance, statut=TourTontine.STATUT_TOUR.EN_COURS):
    """`date` (ouverture) est backdatée à `date_echeance - 30 jours` (fréquence
    MENSUEL des tontines de test) pour que le cache `date_echeance` soit
    COHÉRENT avec `apps.tontine.scheduling.tour_echeance` par défaut — sinon
    le job sauterait systématiquement le tour pour divergence. Pour tester
    explicitement la divergence, un test dédié désynchronise `date_echeance`
    après coup (voir `test_divergence_cache_date_echeance_saute_le_tour`)."""
    tour = TourTontine.objects.create(
        tontine=tontine,
        user=beneficiaire,
        numero_du_tour=numero,
        montant_depose=Decimal("0"),
        statut_tour=statut,
    )
    TourTontine.objects.filter(pk=tour.pk).update(
        date_echeance=date_echeance, date=date_echeance - timedelta(days=30)
    )
    tour.refresh_from_db()
    return tour


def _run(*, phase="all", tontine_id=None, dry_run=False, extra=None):
    out = StringIO()
    kwargs = {"phase": phase, "stdout": out}
    if tontine_id is not None:
        kwargs["tontine_id"] = tontine_id
    if dry_run:
        kwargs["dry_run"] = True
    if extra:
        kwargs.update(extra)
    call_command("apply_tontine_penalties", **kwargs)
    return out.getvalue()


@override_settings(PENALITES_AUTO_CUTOFF=CUTOFF)
class PhaseConstatTests(TestCase):
    def setUp(self):
        self.host = _user("host")
        self.member2 = _user("mem2")
        self.tontine, self.regle = _tontine_avec_regle(self.host)
        _add_member(self.tontine, self.member2, 2)
        self.now = timezone.now()
        self.tour = _make_tour(self.tontine, self.host, 1, date_echeance=self.now - timedelta(days=2))

    def test_constate_une_penalite_pour_le_payeur_courant_en_retard(self):
        _run(phase="constat")
        self.assertEqual(Penalite.objects.count(), 1)
        penalite = Penalite.objects.get()
        self.assertEqual(penalite.user_id, self.host.id)
        self.assertTrue(penalite.est_automatique)

    def test_double_execution_est_idempotente(self):
        _run(phase="constat")
        _run(phase="constat")
        self.assertEqual(Penalite.objects.count(), 1)

    def test_tontine_non_active_est_gelee(self):
        self.tontine.etat = Tontine.ETAT.ARCHIVE
        self.tontine.save(update_fields=["etat"])
        _run(phase="constat")
        self.assertEqual(Penalite.objects.count(), 0)

    def test_dry_run_constat_necrit_rien(self):
        output = _run(phase="constat", dry_run=True)
        self.assertEqual(Penalite.objects.count(), 0)
        self.assertIn("penalites_estimees=1", output)

    def test_divergence_cache_date_echeance_saute_le_tour(self):
        """Si `tour.date_echeance` a divergé du recalcul `tour_echeance`, le
        job doit SAUTER ce tour plutôt que de débiter sur une donnée
        incohérente — jamais de constat malgré un retard apparent."""
        # `frequence=MENSUEL` a une échéance recalculée dépendant de `tour.date`.
        # En modifiant `tour.date_echeance` seul (sans toucher `tour.date`), on
        # crée artificiellement la divergence entre le cache et la valeur
        # recalculée par `tour_echeance`.
        TourTontine.objects.filter(pk=self.tour.pk).update(
            date_echeance=self.now - timedelta(days=999)
        )
        output = _run(phase="constat")
        self.assertEqual(Penalite.objects.count(), 0)
        self.assertIn("echeances_divergentes_ignorees=1", output)

    def test_tour_id_filter_scoping(self):
        host2 = _user("hst2")
        tontine2, regle2 = _tontine_avec_regle(host2)
        _make_tour(tontine2, host2, 1, date_echeance=self.now - timedelta(days=2))
        _run(phase="constat", tontine_id=self.tontine.id)
        self.assertEqual(Penalite.objects.filter(tontine=self.tontine).count(), 1)
        self.assertEqual(Penalite.objects.filter(tontine=tontine2).count(), 0)

    def test_integrity_error_ne_bloque_pas_le_job(self):
        """Une pénalité qui lève `IntegrityError` (contrainte d'unicité, course
        avec une autre écriture) incrémente le compteur d'erreurs mais ne fait
        pas planter le job pour les tours suivants."""
        with patch(
            "apps.tontine.management.commands.apply_tontine_penalties.constater_penalite",
            side_effect=IntegrityError("boom"),
        ):
            output = _run(phase="constat")
        self.assertIn("erreurs=1", output)
        self.assertEqual(Penalite.objects.count(), 0)


@override_settings(PENALITES_AUTO_CUTOFF=CUTOFF)
class PhaseRecouvrementTests(TestCase):
    def setUp(self):
        self.host = _user("host3")
        self.member2 = _user("mem3")
        self.tontine, self.regle = _tontine_avec_regle(self.host, montant_penalite=Decimal("300"))
        _add_member(self.tontine, self.member2, 2)
        self.now = timezone.now()
        self.tour = _make_tour(
            self.tontine,
            self.host,
            1,
            date_echeance=self.now - timedelta(days=2),
            statut=TourTontine.STATUT_TOUR.TERMINE,
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

    def test_recouvre_une_dette_avec_solde_suffisant(self):
        Wallet.objects.create(user=self.member2, solde_courant=Decimal("1000"))
        Wallet.objects.create(user=self.host, solde_courant=Decimal("0"))
        _run(phase="recouvrement")
        self.penalite.refresh_from_db()
        self.assertTrue(self.penalite.est_reglee)
        self.assertEqual(Wallet.objects.get(user=self.member2).solde_courant, Decimal("700"))
        self.assertEqual(Wallet.objects.get(user=self.host).solde_courant, Decimal("300"))

    def test_double_execution_ne_double_pas_le_debit(self):
        Wallet.objects.create(user=self.member2, solde_courant=Decimal("1000"))
        Wallet.objects.create(user=self.host, solde_courant=Decimal("0"))
        _run(phase="recouvrement")
        # Après le premier passage, la pénalité est réglée -> exclue du
        # queryset (`est_reglee=False`) au second passage : aucune écriture
        # supplémentaire, quel que soit `date_derniere_tentative`.
        _run(phase="recouvrement")
        self.assertEqual(
            Transaction.objects.filter(type_transaction=Transaction.TYPE_TRANSACTION.PENALITE).count(),
            1,
        )
        self.assertEqual(Wallet.objects.get(user=self.member2).solde_courant, Decimal("700"))

    def test_anti_thrashing_saute_tentative_recente(self):
        Wallet.objects.create(user=self.member2, solde_courant=Decimal("100"))
        Wallet.objects.create(user=self.host, solde_courant=Decimal("0"))
        self.penalite.date_derniere_tentative = timezone.now() - timedelta(hours=1)
        self.penalite.save(update_fields=["date_derniere_tentative"])
        output = _run(phase="recouvrement")
        self.assertIn("ignorees_anti_thrashing=1", output)
        self.penalite.refresh_from_db()
        # Pas de nouvelle tentative comptabilisée (job a sauté avant d'appeler
        # `tenter_prelevement`).
        self.assertEqual(self.penalite.nombre_tentatives, 0)

    def test_tentative_ancienne_est_retentee(self):
        Wallet.objects.create(user=self.member2, solde_courant=Decimal("100"))
        Wallet.objects.create(user=self.host, solde_courant=Decimal("0"))
        self.penalite.date_derniere_tentative = timezone.now() - timedelta(hours=7)
        self.penalite.save(update_fields=["date_derniere_tentative"])
        output = _run(phase="recouvrement")
        self.assertIn("solde_insuffisant=1", output)
        self.penalite.refresh_from_db()
        self.assertEqual(self.penalite.nombre_tentatives, 1)

    def test_dry_run_recouvrement_necrit_rien(self):
        Wallet.objects.create(user=self.member2, solde_courant=Decimal("1000"))
        Wallet.objects.create(user=self.host, solde_courant=Decimal("0"))
        _run(phase="recouvrement", dry_run=True)
        self.penalite.refresh_from_db()
        self.assertFalse(self.penalite.est_reglee)
        self.assertEqual(Transaction.objects.count(), 0)
        self.assertEqual(Wallet.objects.get(user=self.member2).solde_courant, Decimal("1000"))

    def test_integrity_error_incremente_compteur_sans_stopper(self):
        Wallet.objects.create(user=self.member2, solde_courant=Decimal("1000"))
        Wallet.objects.create(user=self.host, solde_courant=Decimal("0"))
        with patch(
            "apps.tontine.management.commands.apply_tontine_penalties.tenter_prelevement",
            side_effect=IntegrityError("boom"),
        ):
            output = _run(phase="recouvrement")
        self.assertIn("erreurs=1", output)
        self.penalite.refresh_from_db()
        self.assertFalse(self.penalite.est_reglee)

    def test_penalite_annulee_exclue_du_recouvrement(self):
        self.penalite.est_annulee = True
        self.penalite.save(update_fields=["est_annulee"])
        Wallet.objects.create(user=self.member2, solde_courant=Decimal("1000"))
        Wallet.objects.create(user=self.host, solde_courant=Decimal("0"))
        _run(phase="recouvrement")
        self.assertEqual(Transaction.objects.count(), 0)


@override_settings(PENALITES_AUTO_CUTOFF=CUTOFF)
class IdempotenceFullRunTests(TestCase):
    """Enchaîne constat + recouvrement deux fois de suite sur le même état :
    aucune écriture supplémentaire, mêmes soldes."""

    def setUp(self):
        self.host = _user("host5")
        self.member2 = _user("mem5")
        self.tontine, self.regle = _tontine_avec_regle(self.host, montant_penalite=Decimal("300"))
        _add_member(self.tontine, self.member2, 2)
        self.now = timezone.now()
        # EN_COURS : indispensable pour que la phase `constat` (filtrée sur
        # `statut_tour=EN_COURS`) constate d'abord une pénalité avant que la
        # phase `recouvrement` ne la solde.
        self.tour = _make_tour(
            self.tontine,
            self.host,
            1,
            date_echeance=self.now - timedelta(days=2),
            statut=TourTontine.STATUT_TOUR.EN_COURS,
        )
        Wallet.objects.create(user=self.host, solde_courant=Decimal("2000"))

    def test_double_passage_all_est_totalement_idempotent(self):
        _run(phase="all")
        penalite_count_1 = Penalite.objects.count()
        txn_count_1 = Transaction.objects.count()
        soldes_1 = list(Wallet.objects.order_by("user_id").values_list("solde_courant", flat=True))

        _run(phase="all")
        penalite_count_2 = Penalite.objects.count()
        txn_count_2 = Transaction.objects.count()
        soldes_2 = list(Wallet.objects.order_by("user_id").values_list("solde_courant", flat=True))

        self.assertEqual(penalite_count_1, penalite_count_2)
        self.assertEqual(txn_count_1, txn_count_2)
        self.assertEqual(soldes_1, soldes_2)
        self.assertGreaterEqual(penalite_count_1, 1)

    def test_penalite_auto_annulee_nest_pas_recreee_au_passage_suivant(self):
        """Contrainte `uniq_penalite_auto_par_tour_et_user` incluant les
        pénalités annulées : une pénalité auto annulée par erreur ne doit
        JAMAIS être recréée par le job au passage suivant, même si le membre
        est toujours en retard."""
        _run(phase="constat")
        penalite = Penalite.objects.get(tontine=self.tontine)
        penalite.est_annulee = True
        penalite.date_annulation = timezone.now()
        penalite.save(update_fields=["est_annulee", "date_annulation"])

        _run(phase="constat")
        self.assertEqual(Penalite.objects.filter(tontine=self.tontine).count(), 1)
        penalite.refresh_from_db()
        self.assertTrue(penalite.est_annulee)
