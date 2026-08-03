"""Tests de l'intégration CinetPay pour le flow de retrait (mode
MOBILE_MONEY_SANDBOX=False) : initiation du transfert (withdrawal) et
traitement du webhook de confirmation (cinetpay_transfer_notify).

Tous les appels HTTP vers CinetPay sont mockés au niveau du client
`apps.wallet.cinetpay` — aucun appel réseau réel n'est effectué. Style aligné
sur test_cinetpay_deposit.py.
"""
import uuid
from decimal import Decimal
from unittest.mock import patch

from django.test import override_settings
from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase

from apps.audits.models import AuditLog
from apps.authn.models import User
from apps.wallet import cinetpay
from apps.wallet.models import Transaction, Wallet

WITHDRAWAL_URL = reverse("wallet-withdrawal")
NOTIFY_URL = reverse("wallet-withdrawal-notify")

CINETPAY_SETTINGS = dict(
    MOBILE_MONEY_SANDBOX=False,
    CINETPAY_API_KEY="test-api-key",
    CINETPAY_SITE_ID="test-site-id",
    CINETPAY_CURRENCY="XOF",
    CINETPAY_TRANSFER_PASSWORD="test-transfer-password",
    CINETPAY_TRANSFER_NOTIFY_URL="https://backend.example.com/wallet/withdrawal/notify/",
    CINETPAY_DEFAULT_PHONE_PREFIX="225",
)


def _create_user(username: str, *, phone_suffix: str = "090") -> User:
    unique_suffix = str(abs(hash(username)) % 10**8).zfill(8)
    return User.objects.create_user(
        username=username,
        password="testpass123",
        code_pin="1234",
        numero_telephone=f"225{phone_suffix}{unique_suffix}",
    )


def _token_payload(token: str = "tok-abc123") -> dict:
    return {"code": "0", "message": "OPERATION_SUCCES", "data": {"token": token}}


def _contact_success_payload() -> dict:
    return {"code": "0", "message": "OPERATION_SUCCES", "data": [{"code": "0"}]}


def _send_success_payload() -> dict:
    return {
        "code": "0",
        "message": "OPERATION_SUCCES",
        "data": {"treatment_status": "NEW"},
    }


def _check_payload(treatment_status: str, amount: str = "4000") -> dict:
    return {
        "code": "0",
        "message": "OPERATION_SUCCES",
        "data": {
            "transaction_id": "cp-transfer-123",
            "treatment_status": treatment_status,
            "amount": amount,
            "receiver": "22507080910",
        },
    }


@override_settings(**CINETPAY_SETTINGS)
class CinetPayWithdrawalInitTests(APITestCase):
    def setUp(self):
        self.user = _create_user("cinetpay_withdrawal_init_user")
        self.client.force_authenticate(user=self.user)
        self.wallet = Wallet.objects.create(user=self.user, solde_courant=Decimal("10000"))

    @patch("apps.wallet.views.cinetpay.send_money_to_contact")
    @patch("apps.wallet.views.cinetpay.add_contact")
    @patch("apps.wallet.views.cinetpay.get_transfer_token")
    def test_init_success_debits_wallet_and_creates_pending_transaction(
        self, mock_token, mock_contact, mock_send
    ):
        mock_token.return_value = "tok-abc123"
        mock_contact.return_value = _contact_success_payload()
        mock_send.return_value = _send_success_payload()

        response = self.client.post(
            WITHDRAWAL_URL,
            {"montant_a_retirer": 4000, "mode_de_paiement": "ORANGE"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(
            response.data["statut_transaction"], Transaction.STATUT_TRANSACTION.EN_ATTENTE
        )
        self.assertFalse(response.data["sandbox"])

        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.solde_courant, Decimal("6000"))

        tx = Transaction.objects.get(ref_transaction=response.data["ref_transaction"])
        self.assertEqual(tx.statut_transaction, Transaction.STATUT_TRANSACTION.EN_ATTENTE)
        self.assertEqual(tx.montant_transaction, Decimal("4000"))
        self.assertEqual(tx.type_transaction, Transaction.TYPE_TRANSACTION.RETRAIT)

        mock_send.assert_called_once()
        _, kwargs = mock_send.call_args
        self.assertEqual(kwargs["client_transaction_id"], tx.ref_transaction)
        self.assertEqual(kwargs["amount"], Decimal("4000"))

        self.assertTrue(
            AuditLog.objects.filter(
                user=self.user, action=AuditLog.Action.WITHDRAWAL_INITIATED
            ).exists()
        )

    def test_init_insufficient_balance_refused_without_debit(self):
        response = self.client.post(
            WITHDRAWAL_URL,
            {"montant_a_retirer": 50000, "mode_de_paiement": "ORANGE"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertEqual(response.data["detail"], "Solde insuffisant.")

        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.solde_courant, Decimal("10000"))
        self.assertFalse(Transaction.objects.filter(wallet=self.wallet).exists())

    @patch("apps.wallet.views.cinetpay.get_transfer_token")
    def test_init_cinetpay_failure_refunds_wallet_and_marks_failed(self, mock_token):
        mock_token.side_effect = cinetpay.CinetPayError("Erreur réseau vers CinetPay : timeout")

        response = self.client.post(
            WITHDRAWAL_URL,
            {"montant_a_retirer": 4000, "mode_de_paiement": "ORANGE"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)

        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.solde_courant, Decimal("10000"))

        tx = Transaction.objects.get(wallet=self.wallet)
        self.assertEqual(tx.statut_transaction, Transaction.STATUT_TRANSACTION.ECHOUEE)

        self.assertTrue(
            AuditLog.objects.filter(
                user=self.user, action=AuditLog.Action.WITHDRAWAL_REJECTED
            ).exists()
        )

    @patch("apps.wallet.views.cinetpay.send_money_to_contact")
    @patch("apps.wallet.views.cinetpay.add_contact")
    @patch("apps.wallet.views.cinetpay.get_transfer_token")
    def test_init_insufficient_merchant_payout_balance_refunds_user(
        self, mock_token, mock_contact, mock_send
    ):
        mock_token.return_value = "tok-abc123"
        mock_contact.return_value = _contact_success_payload()
        mock_send.side_effect = cinetpay.CinetPayError(
            "Solde PayOut marchand insuffisant.", payload={"code": "602"}
        )

        response = self.client.post(
            WITHDRAWAL_URL,
            {"montant_a_retirer": 4000, "mode_de_paiement": "ORANGE"},
            format="json",
        )
        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)

        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.solde_courant, Decimal("10000"))

        tx = Transaction.objects.get(wallet=self.wallet)
        self.assertEqual(tx.statut_transaction, Transaction.STATUT_TRANSACTION.ECHOUEE)

    def test_init_refused_when_cinetpay_transfer_not_configured(self):
        with override_settings(CINETPAY_TRANSFER_PASSWORD=""):
            response = self.client.post(
                WITHDRAWAL_URL,
                {"montant_a_retirer": 4000, "mode_de_paiement": "ORANGE"},
                format="json",
            )
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.solde_courant, Decimal("10000"))
        self.assertFalse(Transaction.objects.filter(wallet=self.wallet).exists())

    @patch("apps.wallet.views.cinetpay.send_money_to_contact")
    @patch("apps.wallet.views.cinetpay.add_contact")
    @patch("apps.wallet.views.cinetpay.get_transfer_token")
    def test_init_idempotent_replay_does_not_debit_twice(self, mock_token, mock_contact, mock_send):
        mock_token.return_value = "tok-abc123"
        mock_contact.return_value = _contact_success_payload()
        mock_send.return_value = _send_success_payload()

        key = str(uuid.uuid4())
        payload = {"montant_a_retirer": 4000, "mode_de_paiement": "ORANGE", "idempotency_key": key}

        first = self.client.post(WITHDRAWAL_URL, payload, format="json")
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(mock_send.call_count, 1)

        second = self.client.post(WITHDRAWAL_URL, payload, format="json")
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertTrue(second.data["idempotent_replay"])
        self.assertEqual(mock_send.call_count, 1)

        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.solde_courant, Decimal("6000"))
        self.assertEqual(
            Transaction.objects.filter(wallet=self.wallet, client_ref=key).count(), 1
        )


@override_settings(**CINETPAY_SETTINGS)
class CinetPayTransferNotifyWebhookTests(APITestCase):
    def setUp(self):
        self.user = _create_user("cinetpay_withdrawal_notify_user")
        self.wallet = Wallet.objects.create(user=self.user, solde_courant=Decimal("6000"))
        self.tx = Transaction.objects.create(
            wallet=self.wallet,
            solde_courant=Decimal("6000"),
            ref_transaction="Rtestref00001",
            mode_de_paiement=Transaction.MODE_DE_PAIEMENT.ORANGE,
            montant_transaction=Decimal("4000"),
            statut_transaction=Transaction.STATUT_TRANSACTION.EN_ATTENTE,
            type_transaction=Transaction.TYPE_TRANSACTION.RETRAIT,
        )

    @patch("apps.wallet.views.cinetpay.check_transfer")
    @patch("apps.wallet.views.cinetpay.get_transfer_token")
    def test_notify_validated_marks_succeeded_without_redebiting(self, mock_token, mock_check):
        mock_token.return_value = "tok-abc123"
        mock_check.return_value = _check_payload("VALIDATED")

        response = self.client.post(NOTIFY_URL, {"client_transaction_id": self.tx.ref_transaction})
        self.assertEqual(response.status_code, 200)

        self.wallet.refresh_from_db()
        self.tx.refresh_from_db()
        # Le wallet avait déjà été débité à l'initiation (6000 = 10000 - 4000
        # dans ce scénario) : un succès ne doit RIEN redébiter.
        self.assertEqual(self.wallet.solde_courant, Decimal("6000"))
        self.assertEqual(self.tx.statut_transaction, Transaction.STATUT_TRANSACTION.REUSSIE)

        self.assertTrue(
            AuditLog.objects.filter(
                user=self.user, action=AuditLog.Action.WITHDRAWAL_CONFIRMED
            ).exists()
        )

    @patch("apps.wallet.views.cinetpay.check_transfer")
    @patch("apps.wallet.views.cinetpay.get_transfer_token")
    def test_notify_rejected_refunds_wallet_and_marks_failed(self, mock_token, mock_check):
        mock_token.return_value = "tok-abc123"
        mock_check.return_value = _check_payload("REJECTED")

        response = self.client.post(NOTIFY_URL, {"client_transaction_id": self.tx.ref_transaction})
        self.assertEqual(response.status_code, 200)

        self.wallet.refresh_from_db()
        self.tx.refresh_from_db()
        self.assertEqual(self.wallet.solde_courant, Decimal("10000"))
        self.assertEqual(self.tx.statut_transaction, Transaction.STATUT_TRANSACTION.ECHOUEE)

        self.assertTrue(
            AuditLog.objects.filter(
                user=self.user, action=AuditLog.Action.WITHDRAWAL_REJECTED
            ).exists()
        )

    @patch("apps.wallet.views.cinetpay.check_transfer")
    @patch("apps.wallet.views.cinetpay.get_transfer_token")
    def test_notify_replayed_twice_is_idempotent_validated(self, mock_token, mock_check):
        mock_token.return_value = "tok-abc123"
        mock_check.return_value = _check_payload("VALIDATED")

        first = self.client.post(NOTIFY_URL, {"client_transaction_id": self.tx.ref_transaction})
        self.assertEqual(first.status_code, 200)
        second = self.client.post(NOTIFY_URL, {"client_transaction_id": self.tx.ref_transaction})
        self.assertEqual(second.status_code, 200)

        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.solde_courant, Decimal("6000"))
        self.assertEqual(
            AuditLog.objects.filter(
                user=self.user, action=AuditLog.Action.WITHDRAWAL_CONFIRMED
            ).count(),
            1,
        )

    @patch("apps.wallet.views.cinetpay.check_transfer")
    @patch("apps.wallet.views.cinetpay.get_transfer_token")
    def test_notify_replayed_twice_is_idempotent_rejected(self, mock_token, mock_check):
        mock_token.return_value = "tok-abc123"
        mock_check.return_value = _check_payload("REJECTED")

        first = self.client.post(NOTIFY_URL, {"client_transaction_id": self.tx.ref_transaction})
        self.assertEqual(first.status_code, 200)
        second = self.client.post(NOTIFY_URL, {"client_transaction_id": self.tx.ref_transaction})
        self.assertEqual(second.status_code, 200)

        self.wallet.refresh_from_db()
        # Un seul remboursement, pas deux.
        self.assertEqual(self.wallet.solde_courant, Decimal("10000"))
        self.assertEqual(
            AuditLog.objects.filter(
                user=self.user, action=AuditLog.Action.WITHDRAWAL_REJECTED
            ).count(),
            1,
        )

    @patch("apps.wallet.views.cinetpay.check_transfer")
    @patch("apps.wallet.views.cinetpay.get_transfer_token")
    def test_notify_validated_with_wrong_amount_does_not_validate(self, mock_token, mock_check):
        payload = _check_payload("VALIDATED")
        payload["data"]["amount"] = "1000"
        mock_token.return_value = "tok-abc123"
        mock_check.return_value = payload

        response = self.client.post(NOTIFY_URL, {"client_transaction_id": self.tx.ref_transaction})
        self.assertEqual(response.status_code, 200)

        self.wallet.refresh_from_db()
        self.tx.refresh_from_db()
        self.assertEqual(self.wallet.solde_courant, Decimal("10000"))
        self.assertEqual(self.tx.statut_transaction, Transaction.STATUT_TRANSACTION.ECHOUEE)

    def test_notify_unknown_transaction_returns_404(self):
        response = self.client.post(NOTIFY_URL, {"client_transaction_id": "does-not-exist"})
        self.assertEqual(response.status_code, 404)

    def test_notify_missing_client_transaction_id_returns_400(self):
        response = self.client.post(NOTIFY_URL, {})
        self.assertEqual(response.status_code, 400)

    @patch("apps.wallet.views.cinetpay.get_transfer_token")
    def test_notify_check_transfer_failure_returns_502_and_does_not_finalize(self, mock_token):
        mock_token.side_effect = cinetpay.CinetPayError("Erreur réseau vers CinetPay : timeout")

        response = self.client.post(NOTIFY_URL, {"client_transaction_id": self.tx.ref_transaction})
        self.assertEqual(response.status_code, 502)

        self.wallet.refresh_from_db()
        self.tx.refresh_from_db()
        self.assertEqual(self.wallet.solde_courant, Decimal("6000"))
        self.assertEqual(self.tx.statut_transaction, Transaction.STATUT_TRANSACTION.EN_ATTENTE)

    def test_notify_does_not_require_authentication(self):
        """Le webhook est un appel serveur-à-serveur externe, pas un endpoint
        client : il ne doit pas exiger de JWT."""
        with patch("apps.wallet.views.cinetpay.get_transfer_token") as mock_token, patch(
            "apps.wallet.views.cinetpay.check_transfer"
        ) as mock_check:
            mock_token.return_value = "tok-abc123"
            mock_check.return_value = _check_payload("VALIDATED")
            response = self.client.post(
                NOTIFY_URL, {"client_transaction_id": self.tx.ref_transaction}
            )
        self.assertNotEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    @patch("apps.wallet.views.cinetpay.check_transfer")
    @patch("apps.wallet.views.cinetpay.get_transfer_token")
    def test_notify_transient_status_is_a_no_op(self, mock_token, mock_check):
        mock_token.return_value = "tok-abc123"
        mock_check.return_value = _check_payload("IN PROGRESS")

        response = self.client.post(NOTIFY_URL, {"client_transaction_id": self.tx.ref_transaction})
        self.assertEqual(response.status_code, 200)

        self.wallet.refresh_from_db()
        self.tx.refresh_from_db()
        self.assertEqual(self.wallet.solde_courant, Decimal("6000"))
        self.assertEqual(self.tx.statut_transaction, Transaction.STATUT_TRANSACTION.EN_ATTENTE)
