from decimal import Decimal

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.authn.models import User
from apps.savings.models import EpargnePersonnelle
from apps.wallet.models import Transaction, Wallet

CREATE_URL = reverse("savings-create")
DETAIL_URL = reverse("savings-detail")
UPDATE_URL = reverse("savings-update")
DEPOSIT_URL = reverse("savings-deposit")
WITHDRAW_URL = reverse("savings-withdraw")
ARCHIVE_URL = reverse("savings-archive")
DELETE_URL = reverse("savings-delete")
TRANSACTIONS_URL = reverse("savings-transactions")

ETAT = EpargnePersonnelle.ETAT


def _create_user(username: str = "savings_user") -> User:
    return User.objects.create_user(
        username=username,
        password="testpass123",
        code_pin="1234",
        numero_telephone="22507080910",
    )


class CreateSavingsTests(APITestCase):
    def setUp(self):
        self.user = _create_user()
        self.client.force_authenticate(user=self.user)

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.post(CREATE_URL, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_missing_nom_projet(self):
        response = self.client.post(
            CREATE_URL, {"montant_cible": 1000, "duree": 6, "categorie": "Voyage"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Le nom du projet est obligatoire.")

    def test_invalid_montant_cible(self):
        response = self.client.post(
            CREATE_URL,
            {"nom_projet": "Voyage", "montant_cible": "abc", "duree": 6, "categorie": "Voyage"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Entrez le montant cible.")

    def test_invalid_duree(self):
        # _parse_positive_int already rejects <= 0, so duree=0 surfaces the
        # "missing" message.
        response = self.client.post(
            CREATE_URL,
            {"nom_projet": "Voyage", "montant_cible": 1000, "duree": 0, "categorie": "Voyage"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Veuillez préciser la durée.")

    def test_categorie_autre_requires_value_categorie(self):
        response = self.client.post(
            CREATE_URL,
            {"nom_projet": "Voyage", "montant_cible": 1000, "duree": 6, "categorie": "Autre"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["detail"], "Veuillez préciser la catégorie de votre projet."
        )

    def test_invalid_categorie(self):
        response = self.client.post(
            CREATE_URL,
            {"nom_projet": "Voyage", "montant_cible": 1000, "duree": 6, "categorie": "Bidon"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Catégorie invalide.")

    def test_create_success(self):
        response = self.client.post(
            CREATE_URL,
            {"nom_projet": "Voyage", "montant_cible": 5000, "duree": 12, "categorie": "Voyage"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        epargne = EpargnePersonnelle.objects.get(pk=response.data["id"])
        self.assertEqual(epargne.hote, self.user)
        self.assertEqual(epargne.objectif_cotisation, 5000)
        self.assertEqual(epargne.etat, ETAT.ACTIF)

    def test_create_with_categorie_autre(self):
        response = self.client.post(
            CREATE_URL,
            {
                "nom_projet": "Divers",
                "montant_cible": 2000,
                "duree": 3,
                "categorie": "Autre",
                "value_categorie": "Moto",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data["categorie"], "Moto")


class SavingsGoalTestMixin:
    def _create_goal(self, **kwargs):
        defaults = dict(
            hote=self.user,
            nom_projet="Voyage",
            objectif_cotisation=5000,
            montant_courant=Decimal("0"),
            categorie="Voyage",
            duree=12,
            etat=ETAT.ACTIF,
        )
        defaults.update(kwargs)
        return EpargnePersonnelle.objects.create(**defaults)


class SavingsDetailTests(SavingsGoalTestMixin, APITestCase):
    def setUp(self):
        self.user = _create_user()
        self.client.force_authenticate(user=self.user)
        self.goal = self._create_goal()

    def test_invalid_id(self):
        response = self.client.get(DETAIL_URL, {"id": "abc"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Identifiant d'objectif invalide.")

    def test_missing_id(self):
        response = self.client.get(DETAIL_URL, {})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Identifiant d'objectif invalide.")

    def test_not_found(self):
        response = self.client.get(DETAIL_URL, {"id": 999999})
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_success(self):
        response = self.client.get(DETAIL_URL, {"id": self.goal.id})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["id"], self.goal.id)


class UpdateSavingsTests(SavingsGoalTestMixin, APITestCase):
    def setUp(self):
        self.user = _create_user()
        self.client.force_authenticate(user=self.user)
        self.goal = self._create_goal(montant_courant=Decimal("2000"))

    def test_montant_cible_below_montant_courant_rejected(self):
        response = self.client.patch(
            UPDATE_URL,
            {
                "id": self.goal.id,
                "nom_projet": "Voyage",
                "montant_cible": 1000,
                "duree": 6,
                "categorie": "Voyage",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["detail"],
            "Le montant cible ne peut pas être inférieur au montant déjà épargné.",
        )

    def test_update_success(self):
        response = self.client.patch(
            UPDATE_URL,
            {
                "id": self.goal.id,
                "nom_projet": "Nouveau nom",
                "montant_cible": 8000,
                "duree": 24,
                "categorie": "Mariage",
            },
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.goal.refresh_from_db()
        self.assertEqual(self.goal.nom_projet, "Nouveau nom")
        self.assertEqual(self.goal.objectif_cotisation, 8000)


class DepositToSavingsTests(SavingsGoalTestMixin, APITestCase):
    def setUp(self):
        self.user = _create_user()
        self.client.force_authenticate(user=self.user)
        self.goal = self._create_goal(objectif_cotisation=5000)
        Wallet.objects.create(user=self.user, solde_courant=Decimal("10000"))

    def test_invalid_montant(self):
        response = self.client.post(
            DEPOSIT_URL, {"id": self.goal.id, "montant": "abc"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Montant invalide.")

    def test_unknown_payment_mode(self):
        response = self.client.post(
            DEPOSIT_URL,
            {"id": self.goal.id, "montant": 1000, "mode_de_paiement": "BITCOIN"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Mode de paiement inconnu.")

    def test_montant_exceeds_remaining(self):
        response = self.client.post(
            DEPOSIT_URL, {"id": self.goal.id, "montant": 6000}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["detail"], "Le montant ne peut pas dépasser le reste à épargner."
        )

    def test_insufficient_wallet_balance(self):
        Wallet.objects.filter(user=self.user).update(solde_courant=Decimal("100"))
        response = self.client.post(
            DEPOSIT_URL, {"id": self.goal.id, "montant": 1000}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Solde insuffisant.")

    def test_deposit_success(self):
        response = self.client.post(
            DEPOSIT_URL,
            {"id": self.goal.id, "montant": 2000, "mode_de_paiement": "ORANGE"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.goal.refresh_from_db()
        self.assertEqual(self.goal.montant_courant, Decimal("2000"))
        wallet = Wallet.objects.get(user=self.user)
        self.assertEqual(wallet.solde_courant, Decimal("8000"))

    def test_deposit_reaching_objectif_marks_atteint(self):
        response = self.client.post(
            DEPOSIT_URL, {"id": self.goal.id, "montant": 5000}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.goal.refresh_from_db()
        self.assertTrue(self.goal.objectif_atteint)


class WithdrawFromSavingsTests(SavingsGoalTestMixin, APITestCase):
    def setUp(self):
        self.user = _create_user()
        self.client.force_authenticate(user=self.user)

    def test_objectif_not_reached(self):
        goal = self._create_goal(objectif_cotisation=5000, montant_courant=Decimal("1000"))
        response = self.client.post(WITHDRAW_URL, {"id": goal.id}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_withdraw_success(self):
        goal = self._create_goal(objectif_cotisation=5000, montant_courant=Decimal("5000"))
        response = self.client.post(WITHDRAW_URL, {"id": goal.id}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["montant_retire"], "5000")
        goal.refresh_from_db()
        self.assertEqual(goal.montant_courant, Decimal("0"))
        wallet = Wallet.objects.get(user=self.user)
        self.assertEqual(wallet.solde_courant, Decimal("5000"))


class ArchiveAndDeleteSavingsTests(SavingsGoalTestMixin, APITestCase):
    def setUp(self):
        self.user = _create_user()
        self.client.force_authenticate(user=self.user)

    def test_archive_requires_zero_balance(self):
        goal = self._create_goal(montant_courant=Decimal("500"))
        response = self.client.post(ARCHIVE_URL, {"id": goal.id}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_archive_success(self):
        goal = self._create_goal(montant_courant=Decimal("0"))
        response = self.client.post(ARCHIVE_URL, {"id": goal.id}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        goal.refresh_from_db()
        self.assertEqual(goal.etat, ETAT.ARCHIVE)

    def test_delete_success(self):
        goal = self._create_goal(montant_courant=Decimal("0"))
        response = self.client.post(DELETE_URL, {"id": goal.id}, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        goal.refresh_from_db()
        self.assertEqual(goal.etat, ETAT.SUPPRIME)

    def test_delete_already_deleted(self):
        goal = self._create_goal(montant_courant=Decimal("0"), etat=ETAT.SUPPRIME)
        response = self.client.post(DELETE_URL, {"id": goal.id}, format="json")
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)


class SavingsTransactionsTests(SavingsGoalTestMixin, APITestCase):
    def setUp(self):
        self.user = _create_user()
        self.client.force_authenticate(user=self.user)
        self.goal = self._create_goal()

    def test_invalid_id(self):
        response = self.client.get(TRANSACTIONS_URL, {"id": "abc"})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_empty_transactions(self):
        response = self.client.get(TRANSACTIONS_URL, {"id": self.goal.id})
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["count"], 0)
