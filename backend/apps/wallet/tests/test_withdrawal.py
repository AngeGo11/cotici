from decimal import Decimal

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.authn.models import User
from apps.wallet.models import Transaction, Wallet

WITHDRAWAL_URL = reverse("wallet-withdrawal")


def _create_user(username: str = "withdraw_user") -> User:
    return User.objects.create_user(
        username=username,
        password="testpass123",
        code_pin="1234",
        numero_telephone="22507080910",
    )


class WithdrawalViewTests(APITestCase):
    def setUp(self):
        self.user = _create_user()
        self.client.force_authenticate(user=self.user)
        Wallet.objects.create(user=self.user, solde_courant=Decimal("10000"))

    def test_withdrawal_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.post(WITHDRAWAL_URL, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_withdrawal_missing_amount(self):
        response = self.client.post(WITHDRAWAL_URL, {"mode_de_paiement": "ORANGE"}, format="json")
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Montant invalide ou absent.")

    def test_withdrawal_zero_amount(self):
        response = self.client.post(
            WITHDRAWAL_URL, {"montant_a_retirer": 0, "mode_de_paiement": "ORANGE"}, format="json"
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["detail"], "Le montant à retirer doit être supérieur à zéro."
        )

    def test_withdrawal_unknown_payment_mode(self):
        response = self.client.post(
            WITHDRAWAL_URL,
            {"montant_a_retirer": 1000, "mode_de_paiement": "BITCOIN"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Mode de paiement inconnu.")

    def test_withdrawal_non_integer_amount_rejected_cleanly(self):
        """Voir DepositViewTests.test_deposit_non_integer_amount_rejected_cleanly :
        même contrainte decimal_places=0 côté modèle. Un montant décimal doit être
        rejeté en 400, sans débiter le wallet ni créer de Transaction."""
        response = self.client.post(
            WITHDRAWAL_URL,
            {"montant_a_retirer": "100.55", "mode_de_paiement": "ORANGE"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("entier", response.data["detail"])
        wallet = Wallet.objects.get(user=self.user)
        self.assertEqual(wallet.solde_courant, Decimal("10000"))
        self.assertFalse(Transaction.objects.exists())

    def test_withdrawal_insufficient_balance(self):
        response = self.client.post(
            WITHDRAWAL_URL,
            {"montant_a_retirer": 50000, "mode_de_paiement": "ORANGE"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Solde insuffisant.")

    def test_withdrawal_success(self):
        response = self.client.post(
            WITHDRAWAL_URL,
            {"montant_a_retirer": 4000, "mode_de_paiement": "MTN"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["ancien_solde"], "10000")
        self.assertEqual(response.data["montant_retire"], "4000")
        self.assertEqual(response.data["nouveau_solde"], "6000")

        wallet = Wallet.objects.get(user=self.user)
        self.assertEqual(wallet.solde_courant, Decimal("6000"))

        tx = Transaction.objects.get(ref_transaction=response.data["ref_transaction"])
        self.assertEqual(tx.mode_de_paiement, Transaction.MODE_DE_PAIEMENT.MTN)
        self.assertEqual(tx.type_transaction, Transaction.TYPE_TRANSACTION.RETRAIT)

    def test_withdrawal_falls_back_to_montant_depose_field(self):
        response = self.client.post(
            WITHDRAWAL_URL,
            {"montant_depose": 2000, "mode_de_paiement": "WAVE"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["montant_retire"], "2000")

    def test_withdrawal_case_insensitive_mode(self):
        response = self.client.post(
            WITHDRAWAL_URL,
            {"montant_a_retirer": 1000, "mode_de_paiement": "orange"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        tx = Transaction.objects.get(ref_transaction=response.data["ref_transaction"])
        self.assertEqual(tx.mode_de_paiement, Transaction.MODE_DE_PAIEMENT.ORANGE)
