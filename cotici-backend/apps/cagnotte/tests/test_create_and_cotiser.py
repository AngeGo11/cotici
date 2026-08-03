from decimal import Decimal

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.authn.models import User
from apps.cagnotte.models import Cagnotte
from apps.wallet.models import Transaction, Wallet

CREATE_URL = reverse("create-cagnotte")
COTISER_URL = reverse("cagnotte-cotiser")


def _create_user(username: str = "cagnotte_user", phone: str = "22507080910") -> User:
    return User.objects.create_user(
        username=username,
        password="testpass123",
        code_pin="1234",
        numero_telephone=phone,
    )


class CreateCagnotteTests(APITestCase):
    def setUp(self):
        self.user = _create_user()
        self.client.force_authenticate(user=self.user)

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.post(CREATE_URL, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_missing_nom_cagnotte(self):
        response = self.client.post(
            CREATE_URL,
            {"description_projet": "Un projet", "objectif_collecte": 1000},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Le nom de la cagnotte est obligatoire.")

    def test_nom_cagnotte_too_short(self):
        response = self.client.post(
            CREATE_URL,
            {
                "nom_cagnotte": "Ab",
                "description_projet": "Un projet",
                "objectif_collecte": 1000,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["detail"],
            "Le nom de la cagnotte doit contenir entre 3 et 255 caractères.",
        )

    def test_missing_description(self):
        response = self.client.post(
            CREATE_URL,
            {"nom_cagnotte": "Construction mosquée du village", "objectif_collecte": 1000},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "La description_projet est obligatoire.")

    def test_description_too_long(self):
        response = self.client.post(
            CREATE_URL,
            {
                "nom_cagnotte": "Construction mosquée du village",
                "description_projet": "x" * 301,
                "objectif_collecte": 1000,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["detail"], "Le description_projet est trop long (300 caractères max)."
        )

    def test_invalid_objectif(self):
        response = self.client.post(
            CREATE_URL,
            {
                "nom_cagnotte": "Construction mosquée du village",
                "description_projet": "Un projet",
                "objectif_collecte": "abc",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["detail"],
            "L'objectif de la collecte doit être un montant entier positif.",
        )

    def test_create_success(self):
        response = self.client.post(
            CREATE_URL,
            {
                "nom_cagnotte": "Construction mosquée du village",
                "description_projet": "Un projet",
                "objectif_collecte": 5000,
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["objectif_collecte"], 5000)
        cagnotte = Cagnotte.objects.get(pk=response.data["id"])
        self.assertEqual(cagnotte.hote, self.user)
        self.assertEqual(cagnotte.nom_cagnotte, "Construction mosquée du village")


class CotiserCagnotteTests(APITestCase):
    def setUp(self):
        self.organizer = _create_user("organizer", "22501020304")
        self.contributor = _create_user("contributor", "22509080706")
        self.client.force_authenticate(user=self.contributor)
        Wallet.objects.create(user=self.contributor, solde_courant=Decimal("10000"))

        self.cagnotte = Cagnotte.objects.create(
            hote=self.organizer,
            nom_cagnotte="Construction mosquée du village",
            description="Projet",
            objectif_cotisation=5000,
            objectif_atteint=False,
            qr_code="x",
        )

    def test_missing_tontine_id(self):
        response = self.client.post(COTISER_URL, {"montant": 1000}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "tontine_id requis.")

    def test_invalid_montant(self):
        response = self.client.post(
            COTISER_URL, {"tontine_id": self.cagnotte.id, "montant": "abc"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["detail"], "Veuillez renseigner un montant de participation valide."
        )

    def test_unknown_cagnotte(self):
        response = self.client.post(
            COTISER_URL, {"tontine_id": 999999, "montant": 1000}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_invalid_mode_falls_back_to_solde_cotici(self):
        response = self.client.post(
            COTISER_URL,
            {"tontine_id": self.cagnotte.id, "montant": 1000, "mode_de_paiement": "BITCOIN"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        tx = Transaction.objects.get(ref_transaction=response.data["ref_transaction"])
        self.assertEqual(tx.mode_de_paiement, Transaction.MODE_DE_PAIEMENT.SOLDE_COTICI)

    def test_cotiser_success(self):
        response = self.client.post(
            COTISER_URL,
            {"tontine_id": self.cagnotte.id, "montant": 2000, "mode_de_paiement": "ORANGE"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["montant_collecte"], "2000")

        wallet = Wallet.objects.get(user=self.contributor)
        self.assertEqual(wallet.solde_courant, Decimal("8000"))

    def test_insufficient_balance(self):
        response = self.client.post(
            COTISER_URL, {"tontine_id": self.cagnotte.id, "montant": 99999}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Solde insuffisant.")

    def test_closed_collecte_rejected(self):
        self.cagnotte.est_active = False
        self.cagnotte.save(update_fields=["est_active"])
        response = self.client.post(
            COTISER_URL, {"tontine_id": self.cagnotte.id, "montant": 1000}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Cette collecte est clôturée.")
