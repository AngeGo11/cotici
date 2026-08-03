"""Tests d'intégration (DB) pour `apps.tontine.services.penalties_service` :
constat, prélèvement, règlement par wallet, règlement hors application,
remboursement — logique financière au coeur du système de pénalités.
"""
from datetime import timedelta
from decimal import Decimal

from django.test import TestCase, override_settings
from django.utils import timezone

from apps.authn.models import User
from apps.tontine.models import Penalite, Tontine, TontineMembre, TontineRegle, TourTontine
from apps.tontine.services.penalties_service import (
    PenaliteDejaTraiteeError,
    PenaliteSansTourError,
    RemboursementImpossibleError,
    SoldeInsuffisantError,
    StatutPrelevement,
    constater_penalite,
    marquer_penalite_reglee_hors_app,
    regler_penalite_par_wallet,
    rembourser_penalite,
    tenter_prelevement,
)
from apps.wallet.models import Transaction, Wallet

CUTOFF = timezone.make_aware(timezone.datetime(2020, 1, 1))


def _user(suffix: str) -> User:
    return User.objects.create_user(
        username=f"pen_svc_{suffix}",
        password="testpass123",
        code_pin="1234",
        numero_telephone=f"22507300{suffix}",
    )


def _tontine_avec_regle(
    host,
    *,
    nombre_max=3,
    montant_cotisation=Decimal("1000"),
    montant_penalite=Decimal("500"),
    delai_grace_heures=24,
    penalites_automatiques=True,
    etat=Tontine.ETAT.ACTIF,
):
    tontine = Tontine.objects.create(
        hote=host,
        type_tontine=Tontine.TYPE_TONTINE.GROUPE,
        description="Tontine pénalités",
        qr_code="qr-pen",
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


def _add_member(tontine, user, ordre, statut=TontineMembre.STATUT_MEMBRE.ACTIF):
    return TontineMembre.objects.create(
        tontine=tontine,
        membre=user,
        role_membre=TontineMembre.ROLE_MEMBRE.PARTICIPANT,
        statut_membre=statut,
        ordre_ramassage=ordre,
    )


def _make_tour(
    tontine, beneficiaire, numero, *, date_echeance, statut=TourTontine.STATUT_TOUR.EN_COURS, date=None
):
    """`date` (ouverture du tour) est par défaut backdatée sur `date_echeance` :
    pour le rang 1, `devenu_payeur_at == tour.date` (voir `penalties.py`), donc
    sans ce backdatage explicite `tour.date` resterait la vraie date de
    création du test (proche de `now`) et aucun scénario "rang 1 en retard"
    ne serait jamais atteignable, quelle que soit l'échéance simulée."""
    tour = TourTontine.objects.create(
        tontine=tontine,
        user=beneficiaire,
        numero_du_tour=numero,
        montant_depose=Decimal("0"),
        statut_tour=statut,
    )
    TourTontine.objects.filter(pk=tour.pk).update(
        date_echeance=date_echeance, date=date if date is not None else date_echeance
    )
    tour.refresh_from_db()
    return tour


def _debit_reussi(tour, user, montant, *, date_transaction=None):
    """`date_transaction` (par défaut la vraie date de création, `auto_now_add`)
    doit être explicitement backdatée dans les scénarios de retard en chaîne :
    c'est cette date qui devient `devenu_payeur_at` pour le membre de rang
    immédiatement supérieur (voir `apps.tontine.penalties`)."""
    wallet, _ = Wallet.objects.get_or_create(user=user)
    txn = Transaction.objects.create(
        wallet=wallet,
        tontine=tour.tontine,
        tour=tour,
        solde_courant=wallet.solde_courant,
        ref_transaction=f"DEB-{tour.pk}-{user.pk}",
        client_ref=f"cot:{tour.pk}:{user.pk}",
        mode_de_paiement=Transaction.MODE_DE_PAIEMENT.SOLDE_COTICI,
        montant_transaction=montant,
        statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
        type_transaction=Transaction.TYPE_TRANSACTION.DEBIT,
    )
    if date_transaction is not None:
        Transaction.objects.filter(pk=txn.pk).update(date_transaction=date_transaction)
        txn.refresh_from_db()
    return txn


@override_settings(PENALITES_AUTO_CUTOFF=CUTOFF)
class ConstaterPenaliteTests(TestCase):
    def setUp(self):
        self.host = _user("host")
        self.member2 = _user("mem2")
        self.member3 = _user("mem3")
        self.tontine, self.regle = _tontine_avec_regle(self.host, nombre_max=3)
        _add_member(self.tontine, self.member2, 2)
        _add_member(self.tontine, self.member3, 3)
        self.now = timezone.now()

    def _tour_en_retard(self, beneficiaire=None, numero=1):
        beneficiaire = beneficiaire or self.host
        return _make_tour(
            self.tontine,
            beneficiaire,
            numero,
            date_echeance=self.now - timedelta(hours=48),
        )

    def test_constate_penalite_pour_le_payeur_courant_en_retard(self):
        tour = self._tour_en_retard()
        penalite = constater_penalite(tour, self.host, self.regle, now=self.now)
        self.assertIsNotNone(penalite)
        self.assertEqual(penalite.montant_due, self.regle.montant_penalite)
        self.assertEqual(penalite.montant_penalite, self.regle.montant_penalite)
        self.assertTrue(penalite.est_automatique)
        self.assertEqual(penalite.tour_id, tour.pk)

    def test_seul_le_payeur_courant_est_penalisable_pas_les_rangs_suivants(self):
        """Le rang 1 (host) est en retard depuis 48h : les rangs 2 et 3, qui
        n'ont structurellement pas encore pu payer, ne doivent JAMAIS recevoir
        de pénalité, même en les soumettant explicitement à `constater_penalite`."""
        tour = self._tour_en_retard()
        p2 = constater_penalite(tour, self.member2, self.regle, now=self.now)
        p3 = constater_penalite(tour, self.member3, self.regle, now=self.now)
        self.assertIsNone(p2)
        self.assertIsNone(p3)
        self.assertEqual(Penalite.objects.count(), 0)

    def test_rang_intermediaire_en_retard_ne_penalise_pas_les_rangs_suivants(self):
        """rang 3 en retard depuis 10 jours : rangs 4/5 jamais pénalisés."""
        member4 = _user("mem4")
        member5 = _user("mem5")
        tontine, regle = _tontine_avec_regle(self.host, nombre_max=5)
        _add_member(tontine, self.member2, 2)
        _add_member(tontine, self.member3, 3)
        _add_member(tontine, member4, 4)
        _add_member(tontine, member5, 5)
        tour = _make_tour(tontine, self.host, 1, date_echeance=self.now - timedelta(days=10))
        # host (rang1) et member2 (rang2) ont déjà cotisé, tôt après
        # l'ouverture du tour (backdaté), member3 (rang3) est le payeur
        # courant, en retard depuis largement plus que le délai de grâce.
        _debit_reussi(
            tour, self.host, regle.montant_cotisation, date_transaction=self.now - timedelta(days=9)
        )
        _debit_reussi(
            tour, self.member2, regle.montant_cotisation, date_transaction=self.now - timedelta(days=8)
        )

        p3 = constater_penalite(tour, self.member3, regle, now=self.now)
        self.assertIsNotNone(p3)

        p4 = constater_penalite(tour, member4, regle, now=self.now)
        p5 = constater_penalite(tour, member5, regle, now=self.now)
        self.assertIsNone(p4)
        self.assertIsNone(p5)
        self.assertEqual(Penalite.objects.filter(user=member4).count(), 0)
        self.assertEqual(Penalite.objects.filter(user=member5).count(), 0)

    def test_beneficiaire_du_tour_est_penalisable_comme_les_autres(self):
        """Le bénéficiaire (`tour.user`) peut être rang 1 et donc payeur
        courant : il doit être pénalisable comme n'importe quel membre."""
        tour = self._tour_en_retard(beneficiaire=self.host)
        penalite = constater_penalite(tour, self.host, self.regle, now=self.now)
        self.assertIsNotNone(penalite)
        self.assertEqual(penalite.user_id, self.host.id)

    def test_pas_de_penalite_si_pas_encore_en_retard(self):
        tour = _make_tour(self.tontine, self.host, 1, date_echeance=self.now + timedelta(hours=1))
        penalite = constater_penalite(tour, self.host, self.regle, now=self.now)
        self.assertIsNone(penalite)

    def test_deadline_glissante_rang_2_utilise_date_debit_du_rang_1(self):
        """Le rang 2 devient payeur seulement quand le rang 1 a payé : sa
        deadline glisse sur cette date, jamais sur l'échéance figée du tour."""
        tour = _make_tour(self.tontine, self.host, 1, date_echeance=self.now - timedelta(days=5))
        # host paie tardivement, bien après l'échéance mais toujours "maintenant".
        debit_tardif = self.now - timedelta(hours=1)
        wallet, _ = Wallet.objects.get_or_create(user=self.host)
        Transaction.objects.create(
            wallet=wallet,
            tontine=tour.tontine,
            tour=tour,
            solde_courant=wallet.solde_courant,
            ref_transaction="DEB-tardif",
            client_ref="cot:tardif",
            mode_de_paiement=Transaction.MODE_DE_PAIEMENT.SOLDE_COTICI,
            montant_transaction=self.regle.montant_cotisation,
            statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
            type_transaction=Transaction.TYPE_TRANSACTION.DEBIT,
        )
        Transaction.objects.filter(ref_transaction="DEB-tardif").update(date_transaction=debit_tardif)

        # member2 devient payeur à `debit_tardif` (1h avant `now`) + grâce
        # 24h : la deadline n'est pas encore atteinte malgré l'échéance
        # ancienne du tour.
        penalite = constater_penalite(tour, self.member2, self.regle, now=self.now)
        self.assertIsNone(penalite)

    def test_garde_fou_penalites_automatiques_false(self):
        self.regle.penalites_automatiques = False
        self.regle.save(update_fields=["penalites_automatiques"])
        tour = self._tour_en_retard()
        penalite = constater_penalite(tour, self.host, self.regle, now=self.now)
        self.assertIsNone(penalite)

    def test_garde_fou_montant_penalite_zero(self):
        # NB : la contrainte DB `tontineregle_penalites_auto_exigent_montant`
        # interdit de PERSISTER `montant_penalite=0` avec
        # `penalites_automatiques=True` — cette combinaison n'existe donc
        # jamais en base (voir `apps.tontine.tests.test_penalties_pure` pour
        # la vérification du garde-fou pur au niveau Python, où l'instance
        # n'est jamais sauvegardée). Ici on vérifie seulement que
        # `constater_penalite` respecte bien ce garde-fou sur un objet en
        # mémoire non persisté, cohérent avec ce que ferait le job s'il
        # recevait malgré tout une règle incohérente (défense en profondeur).
        self.regle.montant_penalite = Decimal("0")
        tour = self._tour_en_retard()
        penalite = constater_penalite(tour, self.host, self.regle, now=self.now)
        self.assertIsNone(penalite)

    @override_settings(PENALITES_AUTO_CUTOFF=None)
    def test_garde_fou_cutoff_none_desactive_globalement(self):
        tour = self._tour_en_retard()
        penalite = constater_penalite(tour, self.host, self.regle, now=self.now)
        self.assertIsNone(penalite)

    def test_garde_fou_tour_avant_cutoff_non_penalise(self):
        tour = _make_tour(self.tontine, self.host, 1, date_echeance=CUTOFF - timedelta(days=1))
        penalite = constater_penalite(tour, self.host, self.regle, now=self.now)
        self.assertIsNone(penalite)

    def test_tour_termine_pas_de_nouveau_constat(self):
        tour = self._tour_en_retard()
        tour.statut_tour = TourTontine.STATUT_TOUR.TERMINE
        tour.save(update_fields=["statut_tour"])
        penalite = constater_penalite(tour, self.host, self.regle, now=self.now)
        self.assertIsNone(penalite)

    def test_tour_reporte_pas_de_nouveau_constat(self):
        tour = self._tour_en_retard()
        tour.statut_tour = TourTontine.STATUT_TOUR.REPORTE
        tour.save(update_fields=["statut_tour"])
        penalite = constater_penalite(tour, self.host, self.regle, now=self.now)
        self.assertIsNone(penalite)

    def test_membre_exclu_jamais_penalise(self):
        """Un membre EXCLU n'apparaît plus dans `active_members_ordered` : il
        n'est jamais le payeur courant retenu, donc jamais pénalisé — même
        appelé explicitement."""
        tontine, regle = _tontine_avec_regle(self.host, nombre_max=2)
        excluded = _user("exclu")
        _add_member(tontine, excluded, 2, statut=TontineMembre.STATUT_MEMBRE.EXCLU)
        tour = _make_tour(tontine, self.host, 1, date_echeance=self.now - timedelta(days=1))
        _debit_reussi(tour, self.host, regle.montant_cotisation)
        penalite = constater_penalite(tour, excluded, regle, now=self.now)
        self.assertIsNone(penalite)

    def test_idempotence_constat_ne_duplique_pas(self):
        tour = self._tour_en_retard()
        p1 = constater_penalite(tour, self.host, self.regle, now=self.now)
        p2 = constater_penalite(tour, self.host, self.regle, now=self.now)
        self.assertIsNotNone(p1)
        self.assertIsNone(p2)
        self.assertEqual(Penalite.objects.count(), 1)

    def test_plafond_dette_atteint_cesse_de_constater(self):
        """3 x montant_cotisation de dette déjà impayée -> pas de nouvelle
        pénalité auto (escalade humaine)."""
        Penalite.objects.create(
            tontine=self.tontine,
            user=self.host,
            tour=None,
            montant_penalite=self.regle.montant_cotisation * 3,
            montant_due=self.regle.montant_cotisation * 3,
            type_penalite=Penalite.TYPE_PENALITE.RETARD_PAIEMENT,
            est_automatique=False,
        )
        tour = self._tour_en_retard()
        penalite = constater_penalite(tour, self.host, self.regle, now=self.now)
        self.assertIsNone(penalite)

    def test_snapshot_immuable_montant_penalite_apres_creation(self):
        tour = self._tour_en_retard()
        penalite = constater_penalite(tour, self.host, self.regle, now=self.now)
        self.regle.montant_penalite = Decimal("999999")
        self.regle.save(update_fields=["montant_penalite"])
        penalite.refresh_from_db()
        self.assertEqual(penalite.montant_penalite, Decimal("500"))
        self.assertEqual(penalite.montant_due, Decimal("500"))


@override_settings(PENALITES_AUTO_CUTOFF=CUTOFF)
class TenterPrelevementTests(TestCase):
    def setUp(self):
        self.host = _user("host2")
        self.member2 = _user("mem2b")
        self.tontine, self.regle = _tontine_avec_regle(
            self.host, nombre_max=2, montant_cotisation=Decimal("1000"), montant_penalite=Decimal("300")
        )
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

    def test_prelevement_reussi_credite_beneficiaire_debite_fautif(self):
        Wallet.objects.create(user=self.member2, solde_courant=Decimal("1000"))
        Wallet.objects.create(user=self.host, solde_courant=Decimal("0"))
        resultat = tenter_prelevement(self.penalite, now=self.now)
        self.assertEqual(resultat.statut, StatutPrelevement.REGLEE)

        self.penalite.refresh_from_db()
        self.assertTrue(self.penalite.est_reglee)
        self.assertEqual(self.penalite.montant_due, Decimal("0"))

        fautif = Wallet.objects.get(user=self.member2)
        benef = Wallet.objects.get(user=self.host)
        self.assertEqual(fautif.solde_courant, Decimal("700"))
        self.assertEqual(benef.solde_courant, Decimal("300"))

    def test_montant_depose_du_tour_jamais_modifie(self):
        Wallet.objects.create(user=self.member2, solde_courant=Decimal("1000"))
        Wallet.objects.create(user=self.host, solde_courant=Decimal("0"))
        montant_avant = self.tour.montant_depose
        tenter_prelevement(self.penalite, now=self.now)
        self.tour.refresh_from_db()
        self.assertEqual(self.tour.montant_depose, montant_avant)

    def test_solde_insuffisant_ne_debite_rien_tout_ou_rien(self):
        Wallet.objects.create(user=self.member2, solde_courant=Decimal("299"))
        Wallet.objects.create(user=self.host, solde_courant=Decimal("0"))
        resultat = tenter_prelevement(self.penalite, now=self.now)
        self.assertEqual(resultat.statut, StatutPrelevement.SOLDE_INSUFFISANT)

        self.penalite.refresh_from_db()
        self.assertFalse(self.penalite.est_reglee)
        self.assertEqual(self.penalite.montant_due, Decimal("300"))
        self.assertEqual(self.penalite.nombre_tentatives, 1)
        self.assertIsNotNone(self.penalite.date_derniere_tentative)

        fautif = Wallet.objects.get(user=self.member2)
        benef = Wallet.objects.get(user=self.host)
        self.assertEqual(fautif.solde_courant, Decimal("299"))
        self.assertEqual(benef.solde_courant, Decimal("0"))

    def test_reserve_cotisation_bloque_prelevement_si_solde_egal_a_la_cotisation(self):
        """Anti-spirale de dette : tour EN_COURS, membre pas encore cotisé,
        solde EXACTEMENT égal à sa cotisation -> jamais prélevé, même si le
        montant de la pénalité seule serait couvert."""
        tour_en_cours = _make_tour(
            self.tontine, self.host, 2, date_echeance=self.now - timedelta(days=1)
        )
        penalite = Penalite.objects.create(
            tontine=self.tontine,
            user=self.member2,
            tour=tour_en_cours,
            montant_penalite=Decimal("300"),
            montant_due=Decimal("300"),
            type_penalite=Penalite.TYPE_PENALITE.RETARD_PAIEMENT,
            est_automatique=True,
        )
        # Solde exactement égal à la cotisation attendue (1000) : aucune
        # marge pour la pénalité (300) -> DOIT rester non prélevée.
        Wallet.objects.create(user=self.member2, solde_courant=Decimal("1000"))
        Wallet.objects.create(user=self.host, solde_courant=Decimal("0"))

        resultat = tenter_prelevement(penalite, now=self.now)
        self.assertEqual(resultat.statut, StatutPrelevement.SOLDE_INSUFFISANT)
        fautif = Wallet.objects.get(user=self.member2)
        self.assertEqual(fautif.solde_courant, Decimal("1000"))

    def test_reserve_cotisation_non_appliquee_si_deja_cotise(self):
        """Même tour EN_COURS, mais le membre A DÉJÀ cotisé (débit réussi
        existant) : la réserve tombe à 0, le prélèvement de la pénalité seule
        doit réussir avec un solde tout juste suffisant."""
        tour_en_cours = _make_tour(
            self.tontine, self.host, 2, date_echeance=self.now - timedelta(days=1)
        )
        _debit_reussi(tour_en_cours, self.member2, self.regle.montant_cotisation)
        penalite = Penalite.objects.create(
            tontine=self.tontine,
            user=self.member2,
            tour=tour_en_cours,
            montant_penalite=Decimal("300"),
            montant_due=Decimal("300"),
            type_penalite=Penalite.TYPE_PENALITE.RETARD_PAIEMENT,
            est_automatique=True,
        )
        # NB : ne PAS supprimer/recréer le wallet de `member2` ici — la
        # `Transaction` de débit créée par `_debit_reussi` référence CE
        # wallet en `CASCADE` : la supprimer supprimerait aussi la preuve de
        # cotisation et fausserait le test. On ajuste juste le solde.
        Wallet.objects.filter(user=self.member2).update(solde_courant=Decimal("300"))
        Wallet.objects.create(user=self.host, solde_courant=Decimal("0"))

        resultat = tenter_prelevement(penalite, now=self.now)
        self.assertEqual(resultat.statut, StatutPrelevement.REGLEE)

    def test_penalite_deja_reglee_leve_exception(self):
        Wallet.objects.create(user=self.member2, solde_courant=Decimal("1000"))
        Wallet.objects.create(user=self.host, solde_courant=Decimal("0"))
        tenter_prelevement(self.penalite, now=self.now)
        with self.assertRaises(PenaliteDejaTraiteeError):
            tenter_prelevement(self.penalite, now=self.now)

    def test_penalite_annulee_leve_exception(self):
        self.penalite.est_annulee = True
        self.penalite.save(update_fields=["est_annulee"])
        with self.assertRaises(PenaliteDejaTraiteeError):
            tenter_prelevement(self.penalite, now=self.now)

    def test_penalite_sans_tour_leve_exception(self):
        penalite_sans_tour = Penalite.objects.create(
            tontine=self.tontine,
            user=self.member2,
            tour=None,
            montant_penalite=Decimal("300"),
            montant_due=Decimal("300"),
            type_penalite=Penalite.TYPE_PENALITE.RETARD_PAIEMENT,
            est_automatique=False,
        )
        with self.assertRaises(PenaliteSansTourError):
            tenter_prelevement(penalite_sans_tour, now=self.now)

    def test_creates_matching_penalite_et_versement_penalite_transactions(self):
        Wallet.objects.create(user=self.member2, solde_courant=Decimal("1000"))
        Wallet.objects.create(user=self.host, solde_courant=Decimal("0"))
        tenter_prelevement(self.penalite, now=self.now)

        debit = Transaction.objects.get(type_transaction=Transaction.TYPE_TRANSACTION.PENALITE)
        credit = Transaction.objects.get(
            type_transaction=Transaction.TYPE_TRANSACTION.VERSEMENT_PENALITE
        )
        self.assertEqual(debit.montant_transaction, credit.montant_transaction)
        self.assertEqual(debit.tour_id, credit.tour_id)
        self.assertEqual(debit.client_ref, f"pen:{self.penalite.pk}")
        self.assertEqual(credit.client_ref, f"penv:{self.penalite.pk}")

    def test_conservation_masse_monetaire_totale_wallets_invariante(self):
        Wallet.objects.create(user=self.member2, solde_courant=Decimal("1000"))
        Wallet.objects.create(user=self.host, solde_courant=Decimal("50"))
        total_avant = sum(Wallet.objects.values_list("solde_courant", flat=True))
        tenter_prelevement(self.penalite, now=self.now)
        total_apres = sum(Wallet.objects.values_list("solde_courant", flat=True))
        self.assertEqual(total_avant, total_apres)

    def test_auto_penalisation_fautif_egal_beneficiaire_est_net_zero(self):
        """RÉGRESSION : quand le fautif de la pénalité EST le bénéficiaire du
        tour (le payeur courant est aussi celui qui ramasse ce tour — cas
        réel, rang 1), le débit et le crédit portent sur le MÊME wallet.

        Bug corrigé : `_executer_prelevement` récupérait `fautif_wallet` et
        `benef_wallet` via deux `select_for_update().get_or_create()`
        indépendants sur la même ligne, donc deux objets Python portant
        chacun le solde lu AVANT toute mutation. Le `.save()` du crédit
        écrasait alors le `.save()` du débit (lost update) : le fautif
        finissait CRÉDITÉ du montant de sa propre pénalité au lieu de
        rester inchangé — fabrication de monnaie pure. `fautif_wallet` et
        `benef_wallet` doivent être la même instance dans ce cas."""
        tour_auto = _make_tour(
            self.tontine, self.member2, 3, date_echeance=self.now - timedelta(days=1)
        )
        penalite = Penalite.objects.create(
            tontine=self.tontine,
            user=self.member2,
            tour=tour_auto,
            montant_penalite=Decimal("300"),
            montant_due=Decimal("300"),
            type_penalite=Penalite.TYPE_PENALITE.RETARD_PAIEMENT,
            est_automatique=True,
        )
        wallet = Wallet.objects.create(user=self.member2, solde_courant=Decimal("2000"))

        resultat = tenter_prelevement(penalite, now=self.now)
        self.assertEqual(resultat.statut, StatutPrelevement.REGLEE)

        wallet.refresh_from_db()
        # Débit de 300 puis crédit de 300 sur le MÊME wallet -> solde
        # strictement inchangé, jamais gonflé.
        self.assertEqual(wallet.solde_courant, Decimal("2000"))

        debit = Transaction.objects.get(
            type_transaction=Transaction.TYPE_TRANSACTION.PENALITE, tour=tour_auto
        )
        credit = Transaction.objects.get(
            type_transaction=Transaction.TYPE_TRANSACTION.VERSEMENT_PENALITE, tour=tour_auto
        )
        self.assertEqual(debit.montant_transaction, Decimal("300"))
        self.assertEqual(credit.montant_transaction, Decimal("300"))


@override_settings(PENALITES_AUTO_CUTOFF=CUTOFF)
class ReglerPenaliteParWalletTests(TestCase):
    def setUp(self):
        self.host = _user("host3")
        self.member2 = _user("mem3b")
        self.tontine, self.regle = _tontine_avec_regle(
            self.host, nombre_max=2, montant_penalite=Decimal("300")
        )
        _add_member(self.tontine, self.member2, 2)
        self.now = timezone.now()
        self.tour = _make_tour(
            self.tontine,
            self.host,
            1,
            date_echeance=self.now - timedelta(days=1),
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

    def test_solde_insuffisant_leve_exception_avec_details(self):
        Wallet.objects.create(user=self.member2, solde_courant=Decimal("100"))
        Wallet.objects.create(user=self.host, solde_courant=Decimal("0"))
        with self.assertRaises(SoldeInsuffisantError) as ctx:
            regler_penalite_par_wallet(self.penalite, self.host)
        self.assertEqual(ctx.exception.solde, Decimal("100"))
        self.assertEqual(ctx.exception.montant_due, Decimal("300"))

    def test_admin_qui_regle_ne_voit_pas_son_propre_solde_bouger(self):
        """Le débit est toujours celui du fautif, jamais de l'acteur/admin."""
        Wallet.objects.create(user=self.member2, solde_courant=Decimal("1000"))
        Wallet.objects.create(user=self.host, solde_courant=Decimal("5000"))
        regler_penalite_par_wallet(self.penalite, self.host)
        # `host` est le bénéficiaire du tour (crédité) et acteur de l'action ;
        # son solde augmente du montant reçu, il n'est jamais débité.
        host_wallet = Wallet.objects.get(user=self.host)
        self.assertEqual(host_wallet.solde_courant, Decimal("5300"))


class MarquerPenaliteRegleeHorsAppTests(TestCase):
    def setUp(self):
        self.host = _user("host4")
        self.member2 = _user("mem4b")
        self.tontine, self.regle = _tontine_avec_regle(self.host, nombre_max=2)
        _add_member(self.tontine, self.member2, 2)
        self.penalite = Penalite.objects.create(
            tontine=self.tontine,
            user=self.member2,
            tour=None,
            montant_penalite=Decimal("300"),
            montant_due=Decimal("300"),
            type_penalite=Penalite.TYPE_PENALITE.RETARD_PAIEMENT,
            est_automatique=False,
        )

    def test_marque_reglee_sans_aucun_mouvement_de_fonds(self):
        Wallet.objects.create(user=self.member2, solde_courant=Decimal("1000"))
        Wallet.objects.create(user=self.host, solde_courant=Decimal("0"))
        marquer_penalite_reglee_hors_app(self.penalite, self.host, "Payé en espèces")
        self.penalite.refresh_from_db()
        self.assertTrue(self.penalite.est_reglee)
        self.assertEqual(self.penalite.montant_due, Decimal("0"))
        self.assertEqual(Wallet.objects.get(user=self.member2).solde_courant, Decimal("1000"))
        self.assertEqual(Wallet.objects.get(user=self.host).solde_courant, Decimal("0"))
        self.assertEqual(Transaction.objects.count(), 0)

    def test_deja_reglee_leve_exception(self):
        marquer_penalite_reglee_hors_app(self.penalite, self.host, "motif")
        with self.assertRaises(PenaliteDejaTraiteeError):
            marquer_penalite_reglee_hors_app(self.penalite, self.host, "motif2")


@override_settings(PENALITES_AUTO_CUTOFF=CUTOFF)
class RembourserPenaliteTests(TestCase):
    def setUp(self):
        self.host = _user("host5")
        self.member2 = _user("mem5b")
        self.tontine, self.regle = _tontine_avec_regle(
            self.host, nombre_max=2, montant_penalite=Decimal("300")
        )
        _add_member(self.tontine, self.member2, 2)
        self.now = timezone.now()
        self.tour = _make_tour(
            self.tontine,
            self.host,
            1,
            date_echeance=self.now - timedelta(days=1),
            statut=TourTontine.STATUT_TOUR.TERMINE,
        )
        self.penalite = Penalite.objects.create(
            tontine=self.tontine,
            user=self.member2,
            tour=self.tour,
            montant_penalite=Decimal("300"),
            montant_due=Decimal("0"),
            type_penalite=Penalite.TYPE_PENALITE.RETARD_PAIEMENT,
            est_automatique=True,
            est_reglee=True,
        )
        Wallet.objects.create(user=self.member2, solde_courant=Decimal("700"))
        Wallet.objects.create(user=self.host, solde_courant=Decimal("300"))

    def test_remboursement_restitue_les_fonds_et_bascule_annulee(self):
        rembourser_penalite(self.penalite, self.host, "Erreur d'attribution")
        self.penalite.refresh_from_db()
        self.assertFalse(self.penalite.est_reglee)
        self.assertTrue(self.penalite.est_annulee)

        fautif = Wallet.objects.get(user=self.member2)
        benef = Wallet.objects.get(user=self.host)
        self.assertEqual(fautif.solde_courant, Decimal("1000"))
        self.assertEqual(benef.solde_courant, Decimal("0"))

    def test_remboursement_impossible_si_beneficiaire_insolvable_rollback_complet(self):
        """Le bénéficiaire a déjà retiré les fonds : le remboursement doit
        échouer PROPREMENT, sans aucun mouvement partiel (rollback complet)."""
        Wallet.objects.filter(user=self.host).update(solde_courant=Decimal("100"))
        with self.assertRaises(RemboursementImpossibleError) as ctx:
            rembourser_penalite(self.penalite, self.host, "Erreur")
        self.assertEqual(ctx.exception.solde, Decimal("100"))
        self.assertEqual(ctx.exception.montant_manquant, Decimal("200"))

        self.penalite.refresh_from_db()
        self.assertTrue(self.penalite.est_reglee)
        self.assertFalse(self.penalite.est_annulee)
        self.assertEqual(Wallet.objects.get(user=self.member2).solde_courant, Decimal("700"))
        self.assertEqual(Wallet.objects.get(user=self.host).solde_courant, Decimal("100"))
        self.assertEqual(
            Transaction.objects.filter(client_ref__startswith="penr").count(), 0
        )

    def test_remboursement_sans_motif_leve_valueerror(self):
        with self.assertRaises(ValueError):
            rembourser_penalite(self.penalite, self.host, "")

    def test_remboursement_penalite_non_reglee_leve_valueerror(self):
        non_reglee = Penalite.objects.create(
            tontine=self.tontine,
            user=self.member2,
            tour=self.tour,
            montant_penalite=Decimal("300"),
            montant_due=Decimal("300"),
            type_penalite=Penalite.TYPE_PENALITE.RETARD_PAIEMENT,
            est_automatique=False,
        )
        with self.assertRaises(ValueError):
            rembourser_penalite(non_reglee, self.host, "motif")

    def test_double_remboursement_sequentiel_leve_valueerror(self):
        """Une pénalité déjà remboursée n'est plus `est_reglee` : un second
        appel de `rembourser_penalite` (ex. double-clic admin) échoue avec
        `ValueError` ("pas réglée"), pas de second mouvement de fonds."""
        rembourser_penalite(self.penalite, self.host, "Première annulation")
        with self.assertRaises(ValueError):
            rembourser_penalite(self.penalite, self.host, "Deuxième tentative")
        fautif = Wallet.objects.get(user=self.member2)
        self.assertEqual(fautif.solde_courant, Decimal("1000"))

    def test_auto_penalisation_remboursement_est_net_zero(self):
        """RÉGRESSION (même bug que `_executer_prelevement`, voir
        `TenterPrelevementTests.test_auto_penalisation_...`) : quand le
        fautif remboursé EST le bénéficiaire du tour, `fautif_wallet` et
        `benef_wallet` doivent être la même instance, sous peine de lost
        update et de fabrication de monnaie lors du remboursement."""
        tour_auto = _make_tour(
            self.tontine, self.member2, 2, date_echeance=self.now - timedelta(days=1)
        )
        penalite_auto = Penalite.objects.create(
            tontine=self.tontine,
            user=self.member2,
            tour=tour_auto,
            montant_penalite=Decimal("300"),
            montant_due=Decimal("0"),
            type_penalite=Penalite.TYPE_PENALITE.RETARD_PAIEMENT,
            est_automatique=True,
            est_reglee=True,
        )
        # `self.member2` a déjà un wallet créé dans `setUp` (700 F) : on
        # ajuste son solde plutôt que d'en recréer un (contrainte OneToOne).
        Wallet.objects.filter(user=self.member2).update(solde_courant=Decimal("1500"))

        rembourser_penalite(penalite_auto, self.host, "Erreur d'attribution")

        wallet = Wallet.objects.get(user=self.member2)
        self.assertEqual(wallet.solde_courant, Decimal("1500"))
