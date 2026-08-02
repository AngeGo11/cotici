from decimal import Decimal

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.authn.models import User
from apps.tontine.models import Tontine, TontineMembre, TontineRegle, TourTontine
from apps.wallet.models import Transaction, Wallet

COTISER_URL = reverse("tontine-cotiser")


def _user(username: str, phone: str) -> User:
    return User.objects.create_user(
        username=username, password="testpass123", code_pin="1234", numero_telephone=phone
    )


class DoubleCotisationRegressionTests(APITestCase):
    """Régression : le contrôle "déjà cotisé pour ce tour" était fait avant
    l'acquisition du verrou wallet, donc jamais revérifié sous verrou — deux
    requêtes concurrentes du même membre pouvaient toutes deux passer."""

    def setUp(self):
        self.host = _user("tontine_host", "22507080920")
        self.member2 = _user("tontine_member2", "22509080721")

        self.tontine = Tontine.objects.create(
            hote=self.host,
            type_tontine=Tontine.TYPE_TONTINE.GROUPE,
            description="Groupe cotisation",
            qr_code="qr-cotis",
        )
        self.regle = TontineRegle.objects.create(
            tontine=self.tontine,
            objectif_cotisation=20000,
            montant_cotisation=10000,
            montant_penalite=0,
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
            statut_tour=TourTontine.STATUT_TOUR.EN_COURS,
        )
        Wallet.objects.create(user=self.host, solde_courant=Decimal("50000"))
        self.client.force_authenticate(user=self.host)

    def test_first_cotisation_succeeds(self):
        response = self.client.post(
            COTISER_URL, {"tontine_id": self.tontine.id, "montant": 10000}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.tour.refresh_from_db()
        self.assertEqual(self.tour.montant_depose, Decimal("10000"))
        wallet = Wallet.objects.get(user=self.host)
        self.assertEqual(wallet.solde_courant, Decimal("40000"))

    def test_second_cotisation_same_tour_rejected(self):
        first = self.client.post(
            COTISER_URL, {"tontine_id": self.tontine.id, "montant": 10000}, format="json"
        )
        self.assertEqual(first.status_code, status.HTTP_201_CREATED)

        second = self.client.post(
            COTISER_URL, {"tontine_id": self.tontine.id, "montant": 10000}, format="json"
        )
        self.assertEqual(second.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            second.data["detail"], "Vous avez déjà réglé votre cotisation pour ce tour."
        )

        # Le solde ne doit avoir été débité qu'une seule fois.
        wallet = Wallet.objects.get(user=self.host)
        self.assertEqual(wallet.solde_courant, Decimal("40000"))
        self.assertEqual(
            Transaction.objects.filter(
                tour=self.tour, wallet__user=self.host, type_transaction=Transaction.TYPE_TRANSACTION.DEBIT
            ).count(),
            1,
        )

    def test_db_constraint_blocks_duplicate_debit_even_bypassing_the_view(self):
        """Filet de sécurité : même en contournant la vue, la contrainte DB doit
        empêcher un deuxième DÉBIT réussi sur le même (tour, wallet)."""
        wallet = Wallet.objects.get(user=self.host)
        Transaction.objects.create(
            wallet=wallet,
            tontine=self.tontine,
            tour=self.tour,
            solde_courant=wallet.solde_courant,
            ref_transaction="TEST-DEBIT-1",
            mode_de_paiement=Transaction.MODE_DE_PAIEMENT.SOLDE_COTICI,
            montant_transaction=Decimal("10000"),
            statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
            type_transaction=Transaction.TYPE_TRANSACTION.DEBIT,
        )
        with self.assertRaises(Exception):
            Transaction.objects.create(
                wallet=wallet,
                tontine=self.tontine,
                tour=self.tour,
                solde_courant=wallet.solde_courant,
                ref_transaction="TEST-DEBIT-2",
                mode_de_paiement=Transaction.MODE_DE_PAIEMENT.SOLDE_COTICI,
                montant_transaction=Decimal("10000"),
                statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
                type_transaction=Transaction.TYPE_TRANSACTION.DEBIT,
            )
