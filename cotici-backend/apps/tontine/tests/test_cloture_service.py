"""Tests d'intégration pour `apps.tontine.services.cloture_service` (clôture
forcée à échéance, "pot partiel") et le recouvrement associé
(`apps.tontine.services.dette_service` / `recouvrement_service`).

Couvre : clôture avec impayés (dettes + pénalités constatées, jamais
créditées au constat), pot partiel versé sans blocage, idempotence d'une
double exécution, règlement tardif reversé au bénéficiaire lésé (même
plusieurs tours en arrière), "compensation" du bénéficiaire par enchaînement
du recouvrement juste après sa propre clôture (y compris pot net nul), et
concurrence cotisation/clôture (verrou `TourTontine`).
"""
from decimal import Decimal
from unittest.mock import patch

from django.db import transaction
from django.test import TestCase, TransactionTestCase, override_settings
from django.utils import timezone

from apps.authn.models import User
from apps.tontine.models import DetteCotisation, Penalite, Tontine, TontineMembre, TontineRegle, TourTontine
from apps.tontine.services.cloture_service import StatutCloture, cloturer_tour
from apps.tontine.services.dette_service import tenter_reglement_dette
from apps.tontine.services.recouvrement_service import regler_creances_membre
from apps.wallet.models import Transaction, Wallet

CUTOFF = timezone.make_aware(timezone.datetime(2020, 1, 1))


def _user(suffix: str) -> User:
    return User.objects.create_user(
        username=f"clot_{suffix}",
        password="testpass123",
        code_pin="1234",
        numero_telephone=f"22508000{suffix}",
    )


def _tontine_avec_regle(
    host,
    *,
    nombre_max=3,
    montant_cotisation=Decimal("1000"),
    montant_penalite=Decimal("200"),
    penalites_automatiques=False,
):
    tontine = Tontine.objects.create(
        hote=host,
        type_tontine=Tontine.TYPE_TONTINE.GROUPE,
        description="Tontine clôture",
        qr_code="qr-clot",
        etat=Tontine.ETAT.ACTIF,
    )
    regle = TontineRegle.objects.create(
        tontine=tontine,
        objectif_cotisation=montant_cotisation * nombre_max * nombre_max,
        montant_cotisation=montant_cotisation,
        montant_penalite=montant_penalite,
        nombre_max=nombre_max,
        nombre_tours=nombre_max,
        delai_grace_heures=0,
        penalites_automatiques=penalites_automatiques,
        ordre_ramassage=TontineRegle.ORDRE_RAMASSAGE.DEFINI_PAR_ADMIN,
        frequence=TontineRegle.FREQUENCE_COTISATION.JOURNALIER,
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


def _make_tour(tontine, beneficiaire, numero, *, date_echeance):
    tour = TourTontine.objects.create(
        tontine=tontine,
        user=beneficiaire,
        numero_du_tour=numero,
        montant_depose=Decimal("0"),
        statut_tour=TourTontine.STATUT_TOUR.EN_COURS,
    )
    TourTontine.objects.filter(pk=tour.pk).update(date_echeance=date_echeance)
    tour.refresh_from_db()
    return tour


def _cotiser(tour, user, montant):
    """Simule UNE cotisation réussie sur `tour` : crée la `Transaction` de
    débit (nécessaire pour `member_user_ids_paid_for_tour`) et incrémente
    `tour.montant_depose`. NE débite PAS le wallet du payeur (le montant
    déposé n'est pas modélisé par ce helper — seule l'écriture de la
    transaction/l'appartenance au pot collecté est nécessaire pour les tests
    de ce module) : les assertions sur le solde du PAYEUR lui-même doivent en
    tenir compte."""
    wallet, _ = Wallet.objects.get_or_create(user=user)
    Transaction.objects.create(
        wallet=wallet,
        tontine=tour.tontine,
        tour=tour,
        solde_courant=wallet.solde_courant,
        ref_transaction=f"C-{tour.pk}-{user.pk}",
        client_ref=f"c:{tour.pk}:{user.pk}",
        mode_de_paiement=Transaction.MODE_DE_PAIEMENT.SOLDE_COTICI,
        montant_transaction=montant,
        statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
        type_transaction=Transaction.TYPE_TRANSACTION.DEBIT,
    )
    TourTontine.objects.filter(pk=tour.pk).update(montant_depose=tour.montant_depose + montant)
    tour.refresh_from_db()


@override_settings(PENALITES_AUTO_CUTOFF=CUTOFF)
class ClotureAvecImpayesTests(TestCase):
    def setUp(self):
        self.host = _user("host")
        self.m2 = _user("m2")
        self.m3 = _user("m3")
        self.tontine, self.regle = _tontine_avec_regle(self.host, nombre_max=3, penalites_automatiques=True)
        _add_member(self.tontine, self.m2, 2)
        _add_member(self.tontine, self.m3, 3)
        self.now = timezone.now()
        self.tour = _make_tour(self.tontine, self.host, 1, date_echeance=self.now - timezone.timedelta(hours=1))

    def test_cloture_avec_impayes_verse_pot_partiel_et_avance_le_tour(self):
        """Seul `m2` cotise : le bénéficiaire (host) reçoit un pot PARTIEL
        (1000F, pas 3000F attendus), le tour passe au suivant SANS blocage."""
        _cotiser(self.tour, self.m2, self.regle.montant_cotisation)

        resultat = cloturer_tour(self.tour.pk, now=self.now)

        self.assertEqual(resultat.statut, StatutCloture.CLOTUREE)
        self.assertEqual(resultat.montant_collecte, Decimal("1000"))
        self.assertEqual(resultat.montant_verse, Decimal("1000"))
        self.assertEqual(resultat.nombre_fautifs, 2)  # host + m3 n'ont pas cotisé

        self.tour.refresh_from_db()
        self.assertEqual(self.tour.statut_tour, TourTontine.STATUT_TOUR.CLOTURE_INCOMPLET)
        self.assertEqual(self.tour.montant_attendu, Decimal("3000"))
        self.assertEqual(self.tour.montant_verse_beneficiaire, Decimal("1000"))

        host_wallet = Wallet.objects.get(user=self.host)
        self.assertEqual(host_wallet.solde_courant, Decimal("1000"))

        # Le tour suivant a bien démarré.
        self.assertTrue(
            TourTontine.objects.filter(
                tontine=self.tontine, numero_du_tour=2, statut_tour=TourTontine.STATUT_TOUR.EN_COURS
            ).exists()
        )

    def test_dettes_de_cotisation_constatees_pour_chaque_fautif_bénéficiaire_lesé_correct(self):
        _cotiser(self.tour, self.m2, self.regle.montant_cotisation)
        cloturer_tour(self.tour.pk, now=self.now)

        dettes = DetteCotisation.objects.filter(tour=self.tour)
        self.assertEqual(dettes.count(), 2)
        for dette in dettes:
            self.assertEqual(dette.beneficiaire_lese_id, self.host.id)
            self.assertEqual(dette.montant_initial, self.regle.montant_cotisation)
            self.assertFalse(dette.est_reglee)

    def test_penalite_constatee_mais_pas_creditee_au_constat(self):
        """Décision produit 2 : la pénalité est constatée à la clôture mais
        JAMAIS créditée au bénéficiaire à ce stade (seulement au règlement)."""
        _cotiser(self.tour, self.m2, self.regle.montant_cotisation)
        cloturer_tour(self.tour.pk, now=self.now)

        penalites = Penalite.objects.filter(tour=self.tour)
        self.assertEqual(penalites.count(), 2)
        self.assertTrue(all(not p.est_reglee for p in penalites))
        # Aucune transaction de versement de pénalité n'a eu lieu au constat.
        self.assertFalse(
            Transaction.objects.filter(type_transaction=Transaction.TYPE_TRANSACTION.VERSEMENT_PENALITE).exists()
        )

    def test_tout_le_monde_paye_statut_termine_pas_clot_incomplet(self):
        for u in (self.host, self.m2, self.m3):
            _cotiser(self.tour, u, self.regle.montant_cotisation)
        resultat = cloturer_tour(self.tour.pk, now=self.now)
        self.tour.refresh_from_db()
        self.assertEqual(self.tour.statut_tour, TourTontine.STATUT_TOUR.TERMINE)
        self.assertEqual(resultat.nombre_fautifs, 0)
        self.assertEqual(self.tour.montant_verse_beneficiaire, Decimal("3000"))

    def test_idempotence_double_execution_ne_double_verse_ni_ne_double_penalise(self):
        _cotiser(self.tour, self.m2, self.regle.montant_cotisation)
        r1 = cloturer_tour(self.tour.pk, now=self.now)
        r2 = cloturer_tour(self.tour.pk, now=self.now)

        self.assertEqual(r1.statut, StatutCloture.CLOTUREE)
        self.assertEqual(r2.statut, StatutCloture.DEJA_CLOTUREE)

        self.assertEqual(DetteCotisation.objects.filter(tour=self.tour).count(), 2)
        self.assertEqual(Penalite.objects.filter(tour=self.tour).count(), 2)
        host_wallet = Wallet.objects.get(user=self.host)
        self.assertEqual(host_wallet.solde_courant, Decimal("1000"))

    def test_aucun_versement_si_personne_na_cotise_jamais_de_pot_plein_ex_nihilo(self):
        """Régression du bug corrigé : personne n'a cotisé -> pot collecté = 0,
        JAMAIS le pot théorique plein (3000F) versé par erreur."""
        resultat = cloturer_tour(self.tour.pk, now=self.now)
        self.assertEqual(resultat.montant_verse, Decimal("0"))
        host_wallet = Wallet.objects.get(user=self.host)
        self.assertEqual(host_wallet.solde_courant, Decimal("0"))


@override_settings(PENALITES_AUTO_CUTOFF=CUTOFF)
class ReglementTardifDetteTests(TestCase):
    """Règlement tardif d'une dette de cotisation : reversé au bénéficiaire
    LÉSÉ du tour concerné, potentiellement plusieurs tours en arrière."""

    def setUp(self):
        self.host = _user("hostd")
        self.m2 = _user("m2d")
        self.m3 = _user("m3d")
        self.tontine, self.regle = _tontine_avec_regle(self.host, nombre_max=3)
        _add_member(self.tontine, self.m2, 2)
        _add_member(self.tontine, self.m3, 3)
        self.now = timezone.now()

    def test_reglement_credite_le_beneficiaire_lese_du_tour_manque(self):
        tour1 = _make_tour(self.tontine, self.host, 1, date_echeance=self.now - timezone.timedelta(hours=1))
        _cotiser(tour1, self.m2, self.regle.montant_cotisation)
        # m3 ne cotise pas -> dette envers `host` (bénéficiaire du tour 1).
        cloturer_tour(tour1.pk, now=self.now)

        dette = DetteCotisation.objects.get(tour=tour1, debiteur=self.m3)
        self.assertEqual(dette.beneficiaire_lese_id, self.host.id)

        # `m3` régularise BEAUCOUP plus tard, alors que `m2` est déjà devenu
        # bénéficiaire du tour 2 entre-temps (peu importe : la créance reste
        # rattachée à `host`, jamais au bénéficiaire courant).
        Wallet.objects.update_or_create(user=self.m3, defaults={"solde_courant": Decimal("5000")})
        resultat = tenter_reglement_dette(dette, now=timezone.now())

        dette.refresh_from_db()
        self.assertTrue(dette.est_reglee)
        self.assertEqual(dette.montant_du, Decimal("0"))
        host_wallet = Wallet.objects.get(user=self.host)
        # `host` avait déjà reçu le pot partiel du tour 1 (1000F, seul `m2` a
        # cotisé) ; le règlement tardif de `m3` lui crédite 1000F de plus.
        self.assertEqual(host_wallet.solde_courant, Decimal("1000") + self.regle.montant_cotisation)
        m3_wallet = Wallet.objects.get(user=self.m3)
        self.assertEqual(m3_wallet.solde_courant, Decimal("5000") - self.regle.montant_cotisation)

    def test_reglement_deja_traite_leve(self):
        tour1 = _make_tour(self.tontine, self.host, 1, date_echeance=self.now - timezone.timedelta(hours=1))
        cloturer_tour(tour1.pk, now=self.now)
        dette = DetteCotisation.objects.get(tour=tour1, debiteur=self.host)
        Wallet.objects.update_or_create(user=self.host, defaults={"solde_courant": Decimal("5000")})
        tenter_reglement_dette(dette, now=timezone.now())
        dette.refresh_from_db()
        with self.assertRaises(Exception):
            tenter_reglement_dette(dette, now=timezone.now())


@override_settings(PENALITES_AUTO_CUTOFF=CUTOFF)
class CompensationBeneficiaireTests(TestCase):
    """"Compensation" par enchaînement : `regler_creances_membre`, appelé sur
    le bénéficiaire juste après sa propre clôture, solde ses vieilles dettes à
    partir du pot qu'il vient de recevoir — y compris jusqu'à pot net nul."""

    def setUp(self):
        self.host = _user("hostc")
        self.m2 = _user("m2c")
        self.m3 = _user("m3c")
        self.tontine, self.regle = _tontine_avec_regle(
            self.host, nombre_max=3, montant_cotisation=Decimal("1000")
        )
        # Ordre DÉFINI_PAR_ADMIN : le bénéficiaire du tour N est TOUJOURS le
        # membre d'`ordre_ramassage == N` (voir `_beneficiaire_pour_tour`).
        # On aligne explicitement l'ordre sur le scénario voulu (m2 bénéficie
        # du tour 1, host du tour 2) plutôt que de dépendre de l'ordre de
        # création par défaut (host = 1).
        TontineMembre.objects.filter(tontine=self.tontine, membre=self.host).update(ordre_ramassage=2)
        _add_member(self.tontine, self.m2, 1)
        _add_member(self.tontine, self.m3, 3)
        self.now = timezone.now()

    def test_compensation_solde_une_vieille_dette_sur_le_nouveau_pot(self):
        # Tour 1 : m2 bénéficiaire, host ne cotise pas -> host doit 1000F à m2.
        tour1 = _make_tour(self.tontine, self.m2, 1, date_echeance=self.now - timezone.timedelta(hours=2))
        _cotiser(tour1, self.m3, self.regle.montant_cotisation)
        r1 = cloturer_tour(tour1.pk, now=self.now)
        self.assertIsNotNone(r1.tour_suivant_id)
        dette_host = DetteCotisation.objects.get(tour=tour1, debiteur=self.host)
        self.assertEqual(dette_host.beneficiaire_lese_id, self.m2.id)

        # Tour 2 : host devient bénéficiaire, tout le monde cotise cette fois.
        tour2 = TourTontine.objects.get(pk=r1.tour_suivant_id)
        for u in (self.m2, self.m3):
            _cotiser(tour2, u, self.regle.montant_cotisation)
        _cotiser(tour2, self.host, self.regle.montant_cotisation)
        TourTontine.objects.filter(pk=tour2.pk).update(
            date_echeance=self.now - timezone.timedelta(minutes=1)
        )
        tour2.refresh_from_db()
        r2 = cloturer_tour(tour2.pk, now=timezone.now())
        self.assertEqual(r2.montant_verse, Decimal("3000"))

        host_wallet = Wallet.objects.get(user=self.host)
        self.assertEqual(host_wallet.solde_courant, Decimal("3000"))

        # Enchaînement : recouvrement ciblé sur `host`, juste après sa clôture
        # -> sa vieille dette envers `m2` est soldée à même son nouveau pot.
        regler_creances_membre(self.tontine.id, self.host.id, now=timezone.now())

        dette_host.refresh_from_db()
        self.assertTrue(dette_host.est_reglee)
        host_wallet.refresh_from_db()
        self.assertEqual(host_wallet.solde_courant, Decimal("2000"))
        m2_wallet = Wallet.objects.get(user=self.m2)
        # `m2` avait déjà reçu le pot du tour 1 (1000F, seul `m3` avait
        # cotisé) ; la compensation lui crédite 1000F de plus (dette de `host`).
        self.assertEqual(m2_wallet.solde_courant, Decimal("1000") + Decimal("1000"))

    def test_compensation_pot_net_nul_dette_superieure_au_pot(self):
        """La dette du bénéficiaire dépasse ce qu'il vient de recevoir : son
        pot net tombe à 0 (jamais négatif), le reliquat reste EN ATTENTE."""
        tour1 = _make_tour(self.tontine, self.m2, 1, date_echeance=self.now - timezone.timedelta(hours=2))
        # Personne ne cotise : host et m3 doivent chacun 1000F à m2, mais m2
        # ne reçoit qu'un pot vide (0F) à ce stade -> peu importe ici, on
        # simule une dette PLUS ANCIENNE et plus grosse que le pot qu'il va
        # recevoir au tour où IL redevient bénéficiaire plus tard.
        cloturer_tour(tour1.pk, now=self.now)
        dette_host = DetteCotisation.objects.get(tour=tour1, debiteur=self.host)
        self.assertEqual(dette_host.montant_du, Decimal("1000"))

        # `host` reçoit un jour un pot modeste (500F, pot partiel d'un tour
        # ultérieur) : insuffisant pour couvrir sa dette de 1000F envers m2.
        Wallet.objects.update_or_create(user=self.host, defaults={"solde_courant": Decimal("500")})
        resultat = regler_creances_membre(self.tontine.id, self.host.id, now=timezone.now())

        self.assertEqual(resultat.dettes_reglees, 0)
        self.assertEqual(resultat.dettes_insuffisant, 1)
        dette_host.refresh_from_db()
        self.assertFalse(dette_host.est_reglee)
        self.assertEqual(dette_host.montant_du, Decimal("1000"))
        host_wallet = Wallet.objects.get(user=self.host)
        self.assertEqual(host_wallet.solde_courant, Decimal("500"))  # jamais négatif, rien débité


class ConcurrenceCotisationClotureTests(TransactionTestCase):
    """Concurrence cotisation/clôture : le verrou `TourTontine` de
    `cloturer_tour` doit sérialiser avec celui de `cotiser_tontine` (même
    ligne), jamais de double comptage ni de pot incohérent."""

    def setUp(self):
        self.host = _user("hostx")
        self.m2 = _user("m2x")
        self.tontine, self.regle = _tontine_avec_regle(self.host, nombre_max=2, montant_cotisation=Decimal("1000"))
        _add_member(self.tontine, self.m2, 2)
        self.now = timezone.now()
        self.tour = _make_tour(self.tontine, self.host, 1, date_echeance=self.now - timezone.timedelta(hours=1))

    def test_cloture_apres_cotisation_concurrente_reflete_le_montant_final(self):
        """Simule une cotisation qui COMMIT avant l'appel à `cloturer_tour` :
        le pot collecté doit refléter cette cotisation (pas de perte de mise à
        jour), même si elle a eu lieu juste avant la clôture."""
        with transaction.atomic():
            _cotiser(self.tour, self.m2, self.regle.montant_cotisation)

        resultat = cloturer_tour(self.tour.pk, now=timezone.now())
        self.assertEqual(resultat.montant_collecte, Decimal("1000"))
        self.assertEqual(resultat.nombre_fautifs, 1)
