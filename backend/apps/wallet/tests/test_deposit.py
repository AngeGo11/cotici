from decimal import Decimal

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.authn.models import User
from apps.wallet.models import Transaction, Wallet
from apps.wallet.views import _parse_amount, _resolve_payment_mode, _unique_ref

DEPOSIT_URL = reverse("wallet-deposit")


def _create_user(username: str = "deposit_user") -> User:
    return User.objects.create_user(
        username=username,
        password="testpass123",
        code_pin="1234",
        numero_telephone="22507080910",
    )


class DepositHelpersTests(APITestCase):
    def test_parse_amount_valid(self):
        self.assertEqual(_parse_amount(5000), Decimal("5000"))
        self.assertEqual(_parse_amount("12500.5"), Decimal("12500.5"))

    def test_parse_amount_invalid(self):
        self.assertIsNone(_parse_amount(None))
        self.assertIsNone(_parse_amount(""))
        self.assertIsNone(_parse_amount("abc"))

    def test_resolve_payment_mode_valid_and_case_insensitive(self):
        self.assertEqual(
            _resolve_payment_mode("orange"),
            Transaction.MODE_DE_PAIEMENT.ORANGE,
        )
        self.assertEqual(
            _resolve_payment_mode("MTN"),
            Transaction.MODE_DE_PAIEMENT.MTN,
        )

    def test_resolve_payment_mode_empty_defaults_to_solde_cotici(self):
        self.assertEqual(
            _resolve_payment_mode(None),
            Transaction.MODE_DE_PAIEMENT.SOLDE_COTICI,
        )
        self.assertEqual(
            _resolve_payment_mode("  "),
            Transaction.MODE_DE_PAIEMENT.SOLDE_COTICI,
        )

    def test_resolve_payment_mode_unknown(self):
        self.assertIsNone(_resolve_payment_mode("BITCOIN"))

    def test_unique_ref_starts_with_prefix_and_max_length(self):
        ref = _unique_ref("D")
        self.assertTrue(ref.startswith("D"))
        self.assertLessEqual(len(ref), 25)


class DepositViewTests(APITestCase):
    def setUp(self):
        self.user = _create_user()
        self.client.force_authenticate(user=self.user)

    def test_deposit_requires_authentication(self):
        self.client.force_authenticate(user=None)
        response = self.client.post(DEPOSIT_URL, {}, format="json")
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_deposit_missing_amount(self):
        response = self.client.post(
            DEPOSIT_URL,
            {"mode_de_paiement": "ORANGE"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Montant invalide ou absent.")

    def test_deposit_invalid_amount(self):
        response = self.client.post(
            DEPOSIT_URL,
            {"montant_depose": "pas-un-nombre", "mode_de_paiement": "ORANGE"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Montant invalide ou absent.")

    def test_deposit_zero_amount(self):
        response = self.client.post(
            DEPOSIT_URL,
            {"montant_depose": 0, "mode_de_paiement": "ORANGE"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["detail"],
            "Le montant à déposer doit être supérieur à zéro.",
        )

    def test_deposit_negative_amount(self):
        response = self.client.post(
            DEPOSIT_URL,
            {"montant_depose": -500, "mode_de_paiement": "ORANGE"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(
            response.data["detail"],
            "Le montant à déposer doit être supérieur à zéro.",
        )

    def test_deposit_unknown_payment_mode(self):
        response = self.client.post(
            DEPOSIT_URL,
            {"montant_depose": 5000, "mode_de_paiement": "INVALID"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Mode de paiement inconnu.")

    def test_deposit_success_creates_wallet_and_transaction(self):
        self.assertFalse(Wallet.objects.filter(user=self.user).exists())

        response = self.client.post(
            DEPOSIT_URL,
            {"montant_depose": 10000, "mode_de_paiement": "ORANGE"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["ancien_solde"], "0")
        self.assertEqual(response.data["montant_depot"], "10000")
        self.assertEqual(response.data["nouveau_solde"], "10000")
        self.assertEqual(response.data["numero_telephone_utilise"], "22507080910")
        self.assertTrue(response.data["ref_transaction"].startswith("D"))

        wallet = Wallet.objects.get(user=self.user)
        self.assertEqual(wallet.solde_courant, Decimal("10000"))

        tx = Transaction.objects.get(ref_transaction=response.data["ref_transaction"])
        self.assertEqual(tx.wallet, wallet)
        self.assertEqual(tx.montant_transaction, Decimal("10000"))
        self.assertEqual(tx.mode_de_paiement, Transaction.MODE_DE_PAIEMENT.ORANGE)
        self.assertEqual(tx.type_transaction, Transaction.TYPE_TRANSACTION.DEPOT)
        self.assertEqual(tx.statut_transaction, Transaction.STATUT_TRANSACTION.REUSSIE)
        self.assertIsNone(tx.tontine_id)
        self.assertIsNone(tx.tour_id)
        self.assertIsNone(tx.epargne_id)

    def test_deposit_accumulates_balance(self):
        Wallet.objects.create(user=self.user, solde_courant=Decimal("3000"))

        response = self.client.post(
            DEPOSIT_URL,
            {"montant_depose": 7000, "mode_de_paiement": "WAVE"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["ancien_solde"], "3000")
        self.assertEqual(response.data["nouveau_solde"], "10000")

        wallet = Wallet.objects.get(user=self.user)
        self.assertEqual(wallet.solde_courant, Decimal("10000"))

    def test_deposit_accepts_all_mobile_money_modes(self):
        modes = [
            Transaction.MODE_DE_PAIEMENT.ORANGE,
            Transaction.MODE_DE_PAIEMENT.MTN,
            Transaction.MODE_DE_PAIEMENT.WAVE,
            Transaction.MODE_DE_PAIEMENT.MOOV,
        ]
        for index, mode in enumerate(modes):
            user = _create_user(f"deposit_user_{index}")
            self.client.force_authenticate(user=user)
            response = self.client.post(
                DEPOSIT_URL,
                {"montant_depose": 1000, "mode_de_paiement": mode},
                format="json",
            )
            self.assertEqual(response.status_code, status.HTTP_200_OK, msg=mode)
            tx = Transaction.objects.get(ref_transaction=response.data["ref_transaction"])
            self.assertEqual(tx.mode_de_paiement, mode)

    def test_deposit_without_mode_uses_solde_cotici(self):
        response = self.client.post(
            DEPOSIT_URL,
            {"montant_depose": 2500},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        tx = Transaction.objects.get(ref_transaction=response.data["ref_transaction"])
        self.assertEqual(tx.mode_de_paiement, Transaction.MODE_DE_PAIEMENT.SOLDE_COTICI)

    def test_deposit_does_not_affect_other_user_wallet(self):
        other = _create_user("other_user")
        Wallet.objects.create(user=other, solde_courant=Decimal("99999"))

        self.client.post(
            DEPOSIT_URL,
            {"montant_depose": 5000, "mode_de_paiement": "MTN"},
            format="json",
        )

        other_wallet = Wallet.objects.get(user=other)
        self.assertEqual(other_wallet.solde_courant, Decimal("99999"))
