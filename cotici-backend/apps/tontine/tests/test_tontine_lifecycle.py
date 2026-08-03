from decimal import Decimal

from django.test import TestCase
from django.utils import timezone

from apps.authn.models import User
from apps.solidarity.models import Solidarity
from apps.solidarity.views import _nb_contributeurs, _solidarity_retrait_bloque_raison
from apps.tontine.helpers import groupe_retrait_bloque_raison, tontine_cycle_demarre
from apps.tontine.models import Tontine, TontineMembre, TontineRegle, TourTontine
from apps.wallet.models import Transaction, Wallet


def _user(username: str, phone: str) -> User:
    return User.objects.create_user(
        username=username,
        password="testpass123",
        code_pin="1234",
        numero_telephone=phone,
    )


class SolidarityLifecycleTests(TestCase):
    def setUp(self):
        self.organizer = _user("org", "+2250700000001")
        self.contributor = _user("contrib", "+2250700000002")
        self.solidarity = Solidarity.objects.create(
            hote=self.organizer,
            description="Maladie — test",
            qr_code="qr-solidarity",
            beneficiaire_telephone="+2250700000003",
            objectif_cotisation=100_000,
        )
        TontineMembre.objects.create(
            tontine=self.solidarity,
            membre=self.organizer,
            role_membre=TontineMembre.ROLE_MEMBRE.ADMIN,
            statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
            ordre_ramassage=1,
        )

    def test_solidarity_sans_contributeur_peut_etre_retiree(self):
        self.assertIsNone(_solidarity_retrait_bloque_raison(self.solidarity))

    def test_solidarity_avec_contributeur_bloquee(self):
        wallet = Wallet.objects.create(user=self.contributor, solde_courant=Decimal("5000"))
        Transaction.objects.create(
            wallet=wallet,
            tontine=self.solidarity,
            solde_courant=Decimal("4000"),
            ref_transaction="C-TEST-001",
            mode_de_paiement=Transaction.MODE_DE_PAIEMENT.SOLDE_COTICI,
            montant_transaction=Decimal("1000"),
            statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
            type_transaction=Transaction.TYPE_TRANSACTION.CONTRIBUTION_SOLIDAIRE,
        )
        self.assertEqual(_nb_contributeurs(self.solidarity), 1)
        self.assertIsNotNone(_solidarity_retrait_bloque_raison(self.solidarity))


class GroupeLifecycleTests(TestCase):
    def setUp(self):
        self.host = _user("host", "+2250700000010")
        self.tontine = Tontine.objects.create(
            hote=self.host,
            type_tontine=Tontine.TYPE_TONTINE.GROUPE,
            description="Groupe test",
            qr_code="qr-groupe",
        )
        self.regle = TontineRegle.objects.create(
            tontine=self.tontine,
            objectif_cotisation=200_000,
            montant_cotisation=10_000,
            montant_penalite=0,
            nombre_max=2,
            nombre_tours=2,
            ordre_ramassage=TontineRegle.ORDRE_RAMASSAGE.ALEATOIRE,
            frequence=TontineRegle.FREQUENCE_COTISATION.MENSUEL,
        )

    def test_groupe_avant_tour1_peut_etre_retiree(self):
        self.assertFalse(tontine_cycle_demarre(self.tontine))
        self.assertIsNone(groupe_retrait_bloque_raison(self.tontine, self.regle))

    def test_groupe_cycle_en_cours_bloquee(self):
        TourTontine.objects.create(
            tontine=self.tontine,
            user=self.host,
            montant_depose=Decimal("0"),
            numero_du_tour=1,
            statut_tour=TourTontine.STATUT_TOUR.EN_COURS,
        )
        self.assertIsNotNone(groupe_retrait_bloque_raison(self.tontine, self.regle))

    def test_groupe_cycle_termine_autorise_retrait(self):
        for numero in (1, 2):
            TourTontine.objects.create(
                tontine=self.tontine,
                user=self.host,
                montant_depose=Decimal("20000"),
                numero_du_tour=numero,
                statut_tour=TourTontine.STATUT_TOUR.TERMINE,
            )
        self.tontine.est_active = False
        self.tontine.save(update_fields=["est_active"])
        self.assertIsNone(groupe_retrait_bloque_raison(self.tontine, self.regle))
