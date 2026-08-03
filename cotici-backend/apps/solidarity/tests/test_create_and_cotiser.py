from decimal import Decimal

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.authn.models import User
from apps.solidarity.models import Solidarity
from apps.tontine.models import Tontine
from apps.wallet.models import Transaction, Wallet

CREATE_URL = reverse("create-solidarity-tontine")
COTISER_URL = reverse("solidarity-cotiser")

ETAT = Tontine.ETAT


def _create_user(username: str, phone: str) -> User:
    return User.objects.create_user(
        username=username,
        password="testpass123",
        code_pin="1234",
        numero_telephone=phone,
    )


class CreateSolidarityTests(APITestCase):
    def setUp(self):
        self.organizer = _create_user("organizer", "22507080910")
        self.beneficiary = _create_user("beneficiary", "22501020304")
        self.client.force_authenticate(user=self.organizer)

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.post(CREATE_URL, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_missing_beneficiaire(self):
        response = self.client.post(
            CREATE_URL, {"motif": "Aide", "objectif_collecte": 1000}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Le numéro du bénéficiaire est obligatoire.")

    def test_beneficiaire_without_account(self):
        response = self.client.post(
            CREATE_URL,
            {"beneficiaire": "22599999999", "motif": "Aide", "objectif_collecte": 1000},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["detail"], "Aucun compte Cotici trouvé pour ce numéro de bénéficiaire."
        )

    def test_missing_motif(self):
        response = self.client.post(
            CREATE_URL,
            {"beneficiaire": "22501020304", "objectif_collecte": 1000},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Le motif est obligatoire.")

    def test_motif_too_long(self):
        response = self.client.post(
            CREATE_URL,
            {"beneficiaire": "22501020304", "motif": "x" * 301, "objectif_collecte": 1000},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Le motif est trop long (300 caractères max).")

    def test_invalid_objectif(self):
        response = self.client.post(
            CREATE_URL,
            {"beneficiaire": "22501020304", "motif": "Aide", "objectif_collecte": "abc"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["detail"],
            "L'objectif de la collecte doit être un montant entier positif.",
        )

    def test_beneficiaire_cannot_be_organizer(self):
        response = self.client.post(
            CREATE_URL,
            {"beneficiaire": "22507080910", "motif": "Aide", "objectif_collecte": 1000},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["detail"], "Le bénéficiaire ne peut pas être l'organisateur du groupe."
        )

    def test_create_success(self):
        response = self.client.post(
            CREATE_URL,
            {"beneficiaire": "22501020304", "motif": "Aide médicale", "objectif_collecte": 5000},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertTrue(response.data["beneficiaire_trouve"])
        solidarity = Solidarity.objects.get(pk=response.data["id"])
        self.assertEqual(solidarity.hote, self.organizer)
        self.assertEqual(solidarity.beneficiaire_telephone, "22501020304")


class CotiserSolidarityTests(APITestCase):
    def setUp(self):
        self.organizer = _create_user("organizer2", "22507080911")
        self.beneficiary = _create_user("beneficiary2", "22501020305")
        self.contributor = _create_user("contributor2", "22509080707")
        self.client.force_authenticate(user=self.contributor)
        Wallet.objects.create(user=self.contributor, solde_courant=Decimal("10000"))

        self.solidarity = Solidarity.objects.create(
            hote=self.organizer,
            description="Aide",
            beneficiaire_telephone="22501020305",
            objectif_cotisation=5000,
            objectif_atteint=False,
            qr_code="x",
            etat=ETAT.ACTIF,
        )

    def test_missing_tontine_id(self):
        response = self.client.post(COTISER_URL, {"montant": 1000}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "tontine_id requis.")

    def test_invalid_montant(self):
        response = self.client.post(
            COTISER_URL, {"tontine_id": self.solidarity.id, "montant": "abc"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["detail"], "Veuillez renseigner un montant de participation valide."
        )

    def test_unknown_solidarity(self):
        response = self.client.post(
            COTISER_URL, {"tontine_id": 999999, "montant": 1000}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_beneficiary_cannot_contribute(self):
        self.client.force_authenticate(user=self.beneficiary)
        Wallet.objects.create(user=self.beneficiary, solde_courant=Decimal("10000"))
        response = self.client.post(
            COTISER_URL, {"tontine_id": self.solidarity.id, "montant": 1000}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["detail"], "Le bénéficiaire ne peut pas contribuer à sa propre collecte."
        )

    def test_invalid_mode_falls_back_to_solde_cotici(self):
        response = self.client.post(
            COTISER_URL,
            {"tontine_id": self.solidarity.id, "montant": 1000, "mode_de_paiement": "BITCOIN"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        tx = Transaction.objects.get(ref_transaction=response.data["ref_transaction"])
        self.assertEqual(tx.mode_de_paiement, Transaction.MODE_DE_PAIEMENT.SOLDE_COTICI)

    def test_cotiser_success(self):
        response = self.client.post(
            COTISER_URL,
            {"tontine_id": self.solidarity.id, "montant": 2000, "mode_de_paiement": "ORANGE"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        wallet = Wallet.objects.get(user=self.contributor)
        self.assertEqual(wallet.solde_courant, Decimal("8000"))

    def test_insufficient_balance(self):
        response = self.client.post(
            COTISER_URL, {"tontine_id": self.solidarity.id, "montant": 99999}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Solde insuffisant.")

    def test_closed_collecte_rejected(self):
        self.solidarity.est_active = False
        self.solidarity.save(update_fields=["est_active"])
        response = self.client.post(
            COTISER_URL, {"tontine_id": self.solidarity.id, "montant": 1000}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Cette collecte est clôturée.")
