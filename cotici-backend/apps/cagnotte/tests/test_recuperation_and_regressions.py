from decimal import Decimal

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.authn.models import User
from apps.cagnotte.models import Cagnotte
from apps.wallet.models import Transaction, Wallet

COTISER_URL = reverse("cagnotte-cotiser")
MINE_URL = reverse("cagnotte-mine")


def _create_user(username: str, phone: str) -> User:
    return User.objects.create_user(
        username=username, password="testpass123", code_pin="1234", numero_telephone=phone
    )


class CagnotteRecuperationEndToEndTests(APITestCase):
    """Couvre le cycle complet create -> cotiser -> verser, qui avait une couverture
    nulle et laissait passer un bug bloquant le versement à vie (type_transaction
    CONTRIBUTION_SOLIDAIRE au lieu de CONTRIBUTION_CAGNOTTE)."""

    def setUp(self):
        self.organizer = _create_user("cagnotte_org", "22507080910")
        self.contributor = _create_user("cagnotte_contrib", "22509080706")
        self.cagnotte = Cagnotte.objects.create(
            hote=self.organizer,
            nom_cagnotte="22501020304",
            description="Projet",
            objectif_cotisation=5000,
            objectif_atteint=False,
            qr_code="x",
        )
        Wallet.objects.create(user=self.contributor, solde_courant=Decimal("10000"))
        self.verser_url = reverse("cagnotte-recuperation", args=[self.cagnotte.id])

    def test_contribution_is_visible_to_montant_collecte(self):
        """Régression : la contribution doit être comptée par _montant_collecte,
        sinon le versement à l'organisateur reste bloqué indéfiniment."""
        self.client.force_authenticate(user=self.contributor)
        response = self.client.post(
            COTISER_URL,
            {"tontine_id": self.cagnotte.id, "montant": 5000, "mode_de_paiement": "ORANGE"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        tx = Transaction.objects.get(ref_transaction=response.data["ref_transaction"])
        self.assertEqual(tx.type_transaction, Transaction.TYPE_TRANSACTION.CONTRIBUTION_CAGNOTTE)

        self.cagnotte.refresh_from_db()
        self.assertTrue(self.cagnotte.objectif_atteint)
        self.assertEqual(response.data["montant_collecte"], "5000")

    def test_full_cycle_cotiser_then_verser_credits_organizer(self):
        self.client.force_authenticate(user=self.contributor)
        cotiser_response = self.client.post(
            COTISER_URL,
            {"tontine_id": self.cagnotte.id, "montant": 5000, "mode_de_paiement": "ORANGE"},
            format="json",
        )
        self.assertEqual(cotiser_response.status_code, status.HTTP_201_CREATED)

        self.client.force_authenticate(user=self.organizer)
        verser_response = self.client.post(self.verser_url, {}, format="json")
        self.assertEqual(verser_response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(verser_response.data["montant_verse"], "5000")

        organizer_wallet = Wallet.objects.get(user=self.organizer)
        self.assertEqual(organizer_wallet.solde_courant, Decimal("5000"))

        vx = Transaction.objects.get(
            wallet=organizer_wallet, type_transaction=Transaction.TYPE_TRANSACTION.VERSEMENT_CAGNOTTE
        )
        self.assertEqual(vx.montant_transaction, Decimal("5000"))

    def test_verser_rejected_before_objectif_reached(self):
        self.client.force_authenticate(user=self.contributor)
        self.client.post(
            COTISER_URL,
            {"tontine_id": self.cagnotte.id, "montant": 1000, "mode_de_paiement": "ORANGE"},
            format="json",
        )

        self.client.force_authenticate(user=self.organizer)
        response = self.client.post(self.verser_url, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "L'objectif n'est pas encore atteint.")


class ListMyCagnotteRegressionTests(APITestCase):
    """Régression : list_my_cagnotte interrogeait Solidarity au lieu de Cagnotte."""

    def test_returns_actual_cagnotte_objects(self):
        organizer = _create_user("cagnotte_org2", "22507080911")
        Cagnotte.objects.create(
            hote=organizer,
            nom_cagnotte="Projet solidaire du quartier",
            description="Projet 2",
            objectif_cotisation=1000,
            objectif_atteint=False,
            qr_code="y",
        )
        self.client.force_authenticate(user=organizer)
        response = self.client.get(MINE_URL)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 1)
        self.assertIn("recuperation_effectue", response.data["results"][0])
        self.assertEqual(
            response.data["results"][0]["nom_cagnotte"],
            "Projet solidaire du quartier",
        )
