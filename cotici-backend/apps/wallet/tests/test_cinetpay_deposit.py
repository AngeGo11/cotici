"""Tests de l'intégration CinetPay pour le flow de dépôt (mode
MOBILE_MONEY_SANDBOX=False) : initiation du paiement (deposit_init) et
traitement du webhook de confirmation (cinetpay_notify).

Tous les appels HTTP vers CinetPay sont mockés au niveau du client
`apps.wallet.cinetpay` — aucun appel réseau réel n'est effectué. Style aligné
sur test_deposit.py / test_idempotency.py.
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

DEPOSIT_URL = reverse("wallet-deposit")
NOTIFY_URL = reverse("wallet-deposit-notify")

CINETPAY_SETTINGS = dict(
    MOBILE_MONEY_SANDBOX=False,
    CINETPAY_API_KEY="test-api-key",
    CINETPAY_SITE_ID="test-site-id",
    CINETPAY_CURRENCY="XOF",
    CINETPAY_NOTIFY_URL="https://backend.example.com/wallet/deposit/notify/",
    CINETPAY_RETURN_URL="https://app.example.com/deposit/status",
)


def _create_user(username: str) -> User:
    unique_suffix = str(abs(hash(username)) % 10**8).zfill(8)
    return User.objects.create_user(
        username=username,
        password="testpass123",
        code_pin="1234",
        numero_telephone=f"225090{unique_suffix}",
    )


def _init_success_payload() -> dict:
    return {
        "code": "201",
        "message": "CREATED",
        "data": {
            "payment_url": "https://checkout.cinetpay.com/payment/abc123",
            "payment_token": "abc123",
        },
        "api_response_id": "1234567890.1234",
    }


def _check_payload(status_value: str) -> dict:
    return {
        "code": "00",
        "message": "SUCCES",
        "data": {
            "status": status_value,
            "amount": "5000",
            "currency": "XOF",
            "payment_method": "OMCICI",
        },
    }


@override_settings(**CINETPAY_SETTINGS)
class CinetPayDepositInitTests(APITestCase):
    def setUp(self):
        self.user = _create_user("cinetpay_init_user")
        self.client.force_authenticate(user=self.user)

    @patch("apps.wallet.views.cinetpay.initiate_payment")
    def test_init_success_creates_pending_transaction_without_crediting(self, mock_init):
        mock_init.return_value = _init_success_payload()

        response = self.client.post(
            DEPOSIT_URL,
            {"montant_depose": 5000, "mode_de_paiement": "ORANGE"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data["statut_transaction"], Transaction.STATUT_TRANSACTION.EN_ATTENTE)
        self.assertEqual(
            response.data["payment_url"], "https://checkout.cinetpay.com/payment/abc123"
        )
        self.assertFalse(response.data["sandbox"])

        wallet = Wallet.objects.get(user=self.user)
        self.assertEqual(wallet.solde_courant, Decimal("0"))

        tx = Transaction.objects.get(ref_transaction=response.data["ref_transaction"])
        self.assertEqual(tx.statut_transaction, Transaction.STATUT_TRANSACTION.EN_ATTENTE)
        self.assertEqual(tx.montant_transaction, Decimal("5000"))

        mock_init.assert_called_once()
        _, kwargs = mock_init.call_args
        self.assertEqual(kwargs["transaction_id"], tx.ref_transaction)
        self.assertEqual(kwargs["amount"], Decimal("5000"))
        self.assertEqual(kwargs["currency"], "XOF")

    @patch("apps.wallet.views.cinetpay.initiate_payment")
    def test_init_network_error_marks_transaction_failed_and_does_not_credit(self, mock_init):
        mock_init.side_effect = cinetpay.CinetPayError("Erreur réseau vers CinetPay : timeout")

        response = self.client.post(
            DEPOSIT_URL,
            {"montant_depose": 5000, "mode_de_paiement": "ORANGE"},
            format="json",
        )

        self.assertEqual(response.status_code, status.HTTP_502_BAD_GATEWAY)

        wallet = Wallet.objects.get(user=self.user)
        self.assertEqual(wallet.solde_courant, Decimal("0"))

        tx = Transaction.objects.get(wallet=wallet)
        self.assertEqual(tx.statut_transaction, Transaction.STATUT_TRANSACTION.ECHOUEE)

    def test_init_refused_when_cinetpay_not_configured(self):
        with override_settings(CINETPAY_API_KEY="", CINETPAY_SITE_ID=""):
            response = self.client.post(
                DEPOSIT_URL,
                {"montant_depose": 5000, "mode_de_paiement": "ORANGE"},
                format="json",
            )
        self.assertEqual(response.status_code, status.HTTP_503_SERVICE_UNAVAILABLE)
        self.assertFalse(Transaction.objects.exists())

    @patch("apps.wallet.views.cinetpay.initiate_payment")
    def test_init_idempotent_replay_does_not_call_cinetpay_twice(self, mock_init):
        mock_init.return_value = _init_success_payload()
        key = str(uuid.uuid4())
        payload = {"montant_depose": 5000, "mode_de_paiement": "ORANGE", "idempotency_key": key}

        first = self.client.post(DEPOSIT_URL, payload, format="json")
        self.assertEqual(first.status_code, status.HTTP_200_OK)
        self.assertEqual(mock_init.call_count, 1)

        second = self.client.post(DEPOSIT_URL, payload, format="json")
        self.assertEqual(second.status_code, status.HTTP_200_OK)
        self.assertTrue(second.data["idempotent_replay"])
        # Pas de second appel CinetPay pour la même clé.
        self.assertEqual(mock_init.call_count, 1)
        self.assertEqual(
            Transaction.objects.filter(wallet__user=self.user, client_ref=key).count(), 1
        )


@override_settings(**CINETPAY_SETTINGS)
class CinetPayNotifyWebhookTests(APITestCase):
    def setUp(self):
        self.user = _create_user("cinetpay_notify_user")
        self.wallet = Wallet.objects.create(user=self.user, solde_courant=Decimal("0"))
        self.tx = Transaction.objects.create(
            wallet=self.wallet,
            solde_courant=Decimal("0"),
            ref_transaction="DEPtestref0001",
            mode_de_paiement=Transaction.MODE_DE_PAIEMENT.ORANGE,
            montant_transaction=Decimal("5000"),
            statut_transaction=Transaction.STATUT_TRANSACTION.EN_ATTENTE,
            type_transaction=Transaction.TYPE_TRANSACTION.DEPOT,
        )

    @patch("apps.wallet.views.cinetpay.check_payment")
    def test_notify_accepted_credits_wallet_once(self, mock_check):
        mock_check.return_value = _check_payload("ACCEPTED")

        response = self.client.post(NOTIFY_URL, {"cpm_trans_id": self.tx.ref_transaction})
        self.assertEqual(response.status_code, 200)

        self.wallet.refresh_from_db()
        self.tx.refresh_from_db()
        self.assertEqual(self.wallet.solde_courant, Decimal("5000"))
        self.assertEqual(self.tx.statut_transaction, Transaction.STATUT_TRANSACTION.REUSSIE)
        self.assertEqual(self.tx.solde_courant, Decimal("5000"))

        self.assertTrue(
            AuditLog.objects.filter(
                user=self.user, action=AuditLog.Action.DEPOSIT_CONFIRMED
            ).exists()
        )

        # Rejouer le webhook (CinetPay peut le renvoyer plusieurs fois) : pas
        # de second crédit.
        response2 = self.client.post(NOTIFY_URL, {"cpm_trans_id": self.tx.ref_transaction})
        self.assertEqual(response2.status_code, 200)
        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.solde_courant, Decimal("5000"))

    @patch("apps.wallet.views.cinetpay.check_payment")
    def test_notify_refused_does_not_credit_and_marks_failed(self, mock_check):
        mock_check.return_value = _check_payload("REFUSED")

        response = self.client.post(NOTIFY_URL, {"cpm_trans_id": self.tx.ref_transaction})
        self.assertEqual(response.status_code, 200)

        self.wallet.refresh_from_db()
        self.tx.refresh_from_db()
        self.assertEqual(self.wallet.solde_courant, Decimal("0"))
        self.assertEqual(self.tx.statut_transaction, Transaction.STATUT_TRANSACTION.ECHOUEE)

    @patch("apps.wallet.views.cinetpay.check_payment")
    def test_notify_accepted_with_wrong_amount_does_not_credit(self, mock_check):
        # Paiement partiel (ou montant altéré) : CinetPay répond ACCEPTED mais
        # le montant encaissé ne correspond pas à celui de l'initiation.
        payload = _check_payload("ACCEPTED")
        payload["data"]["amount"] = "1000"
        mock_check.return_value = payload

        response = self.client.post(NOTIFY_URL, {"cpm_trans_id": self.tx.ref_transaction})
        self.assertEqual(response.status_code, 200)

        self.wallet.refresh_from_db()
        self.tx.refresh_from_db()
        self.assertEqual(self.wallet.solde_courant, Decimal("0"))
        self.assertEqual(self.tx.statut_transaction, Transaction.STATUT_TRANSACTION.ECHOUEE)

    @patch("apps.wallet.views.cinetpay.check_payment")
    def test_notify_accepted_with_wrong_currency_does_not_credit(self, mock_check):
        # 5000 demandés en XOF, 5000 encaissés dans une autre devise : créditer
        # 5000 XOF reviendrait à offrir la différence de change.
        payload = _check_payload("ACCEPTED")
        payload["data"]["currency"] = "GNF"
        mock_check.return_value = payload

        response = self.client.post(NOTIFY_URL, {"cpm_trans_id": self.tx.ref_transaction})
        self.assertEqual(response.status_code, 200)

        self.wallet.refresh_from_db()
        self.tx.refresh_from_db()
        self.assertEqual(self.wallet.solde_courant, Decimal("0"))
        self.assertEqual(self.tx.statut_transaction, Transaction.STATUT_TRANSACTION.ECHOUEE)

    @patch("apps.wallet.views.cinetpay.check_payment")
    def test_notify_accepted_with_missing_amount_does_not_credit(self, mock_check):
        payload = _check_payload("ACCEPTED")
        payload["data"].pop("amount")
        mock_check.return_value = payload

        response = self.client.post(NOTIFY_URL, {"cpm_trans_id": self.tx.ref_transaction})
        self.assertEqual(response.status_code, 200)

        self.wallet.refresh_from_db()
        self.tx.refresh_from_db()
        self.assertEqual(self.wallet.solde_courant, Decimal("0"))
        self.assertEqual(self.tx.statut_transaction, Transaction.STATUT_TRANSACTION.ECHOUEE)

    @patch("apps.wallet.views.cinetpay.check_payment")
    def test_notify_for_already_succeeded_transaction_does_not_recredit(self, mock_check):
        self.tx.statut_transaction = Transaction.STATUT_TRANSACTION.REUSSIE
        self.tx.solde_courant = Decimal("5000")
        self.tx.save(update_fields=["statut_transaction", "solde_courant"])
        self.wallet.solde_courant = Decimal("5000")
        self.wallet.save(update_fields=["solde_courant"])

        mock_check.return_value = _check_payload("ACCEPTED")

        response = self.client.post(NOTIFY_URL, {"cpm_trans_id": self.tx.ref_transaction})
        self.assertEqual(response.status_code, 200)

        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.solde_courant, Decimal("5000"))

    def test_notify_unknown_transaction_returns_404(self):
        response = self.client.post(NOTIFY_URL, {"cpm_trans_id": "does-not-exist"})
        self.assertEqual(response.status_code, 404)

    def test_notify_missing_cpm_trans_id_returns_400(self):
        response = self.client.post(NOTIFY_URL, {})
        self.assertEqual(response.status_code, 400)

    @patch("apps.wallet.views.cinetpay.check_payment")
    def test_notify_check_payment_failure_returns_502_and_does_not_credit(self, mock_check):
        mock_check.side_effect = cinetpay.CinetPayError("Erreur réseau vers CinetPay : timeout")

        response = self.client.post(NOTIFY_URL, {"cpm_trans_id": self.tx.ref_transaction})
        self.assertEqual(response.status_code, 502)

        self.wallet.refresh_from_db()
        self.tx.refresh_from_db()
        self.assertEqual(self.wallet.solde_courant, Decimal("0"))
        self.assertEqual(self.tx.statut_transaction, Transaction.STATUT_TRANSACTION.EN_ATTENTE)

    def test_notify_does_not_require_authentication(self):
        """Le webhook est un appel serveur-à-serveur externe, pas un endpoint
        client : il ne doit pas exiger de JWT."""
        with patch("apps.wallet.views.cinetpay.check_payment") as mock_check:
            mock_check.return_value = _check_payload("ACCEPTED")
            response = self.client.post(NOTIFY_URL, {"cpm_trans_id": self.tx.ref_transaction})
        self.assertNotEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
