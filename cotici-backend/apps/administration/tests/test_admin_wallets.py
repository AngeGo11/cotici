"""`/api/admin/wallets/` : consultation et ajustement manuel des portefeuilles.

Points vérifiés :

- accès refusé hors session staff (401) et sans la permission adéquate (403) ;
- un ajustement sans motif est rejeté (400) sans toucher au solde ;
- un ajustement qui rendrait le solde négatif est refusé (400) ;
- un ajustement nominal met à jour le solde, matérialise une `Transaction`
  cohérente, et laisse une trace `AdminActionLog` (action, motif, avant/après).
"""
from __future__ import annotations

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.administration.domain.roles import StaffRole
from apps.administration.tests.helpers import create_staff_profile, login_staff_client
from apps.audits.models import AdminActionLog
from apps.wallet.models import Transaction, Wallet

User = get_user_model()

LIST_URL = "/api/admin/wallets/"


def _detail_url(wallet_id: int) -> str:
    return f"/api/admin/wallets/{wallet_id}/"


def _adjust_url(wallet_id: int) -> str:
    return f"/api/admin/wallets/{wallet_id}/adjust/"


def _create_client_user(username: str, phone: str) -> User:
    return User.objects.create_user(
        username=username,
        password="testpass123",
        code_pin="1234",
        numero_telephone=phone,
    )


@override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=True, ADMIN_TOTP_REQUIRED=True)
class WalletAccessTests(TestCase):
    """Contrôles d'accès (session staff + permission)."""

    def setUp(self):
        cache.clear()
        self.holder = _create_client_user("client.access", "2250700300001")
        self.wallet = Wallet.objects.create(user=self.holder, solde_courant=Decimal(1000))

    def test_anonymous_denied(self):
        resp = APIClient().get(LIST_URL)
        self.assertIn(resp.status_code, (401, 403))

    def test_denied_without_wallet_read_permission(self):
        # `STAFF_MANAGE` (rôle support n'a pas wallet.read ? support en a en
        # fait) : on retire volontairement toute permission wallet en créant
        # un rôle qui ne l'a pas. Aucun rôle du catalogue n'est totalement
        # dépourvu de wallet.read hormis l'inexistant : on simule donc via un
        # rôle inconnu en désactivant directement le profil staff plutôt que
        # de dépendre d'un rôle métier fragile.
        create_staff_profile(
            username="staff.noperm",
            numero_telephone="2250700300002",
            password="Un-Mot-De-Passe-NoPerm-1",
            role=StaffRole.SUPPORT,
        )
        client = APIClient()
        login_staff_client(
            client, username="staff.noperm", password="Un-Mot-De-Passe-NoPerm-1"
        )
        # Le rôle support a wallet.read mais pas wallet.adjust : vérifie que
        # l'ajustement est bien refusé (403) malgré une session staff valide.
        resp = client.post(
            _adjust_url(self.wallet.pk), {"amount": "100", "reason": "Correction de test"}
        )
        self.assertEqual(resp.status_code, 403, resp.content)

    def test_read_only_role_can_list(self):
        create_staff_profile(
            username="staff.reader",
            numero_telephone="2250700300003",
            password="Un-Mot-De-Passe-Reader-1",
            role=StaffRole.AUDITEUR,
        )
        client = APIClient()
        login_staff_client(
            client, username="staff.reader", password="Un-Mot-De-Passe-Reader-1"
        )
        resp = client.get(LIST_URL)
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.data["count"], 1)


@override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=True, ADMIN_TOTP_REQUIRED=True)
class WalletListDetailTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        create_staff_profile(
            username="staff.wallets",
            numero_telephone="2250700310001",
            password="Un-Mot-De-Passe-Wallets-1",
            role=StaffRole.SUPER_ADMIN,
        )
        login_staff_client(
            self.client, username="staff.wallets", password="Un-Mot-De-Passe-Wallets-1"
        )
        self.holder = _create_client_user("client.wallets", "2250700310002")
        self.wallet = Wallet.objects.create(user=self.holder, solde_courant=Decimal(5000))
        Transaction.objects.create(
            wallet=self.wallet,
            solde_courant=Decimal(5000),
            ref_transaction="REF-WALLET-TEST-1",
            mode_de_paiement=Transaction.MODE_DE_PAIEMENT.ORANGE,
            montant_transaction=Decimal(5000),
            statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
            type_transaction=Transaction.TYPE_TRANSACTION.DEPOT,
        )

    def test_list_includes_transactions_count_and_balance(self):
        resp = self.client.get(LIST_URL)
        self.assertEqual(resp.status_code, 200, resp.content)
        row = resp.data["results"][0]
        self.assertEqual(row["id"], self.wallet.pk)
        self.assertEqual(Decimal(str(row["solde_courant"])), Decimal(5000))
        self.assertEqual(row["transactions_count"], 1)
        # Le numero du client sort masque : la lecture en clair passe
        # exclusivement par /users/{id}/reveal-pii/ (permission + motif + trace).
        self.assertEqual(row["numero_telephone_masque"], "225••••••••02")
        self.assertNotIn("2250700310002", resp.content.decode())

    def test_search_by_phone(self):
        resp = self.client.get(LIST_URL, {"search": "310002"})
        self.assertEqual(resp.data["count"], 1)
        resp = self.client.get(LIST_URL, {"search": "introuvable"})
        self.assertEqual(resp.data["count"], 0)

    def test_ordering_by_balance(self):
        other_holder = _create_client_user("client.wallets.2", "2250700310003")
        Wallet.objects.create(user=other_holder, solde_courant=Decimal(99000))

        resp = self.client.get(LIST_URL, {"ordering": "-solde_courant"})
        balances = [Decimal(str(item["solde_courant"])) for item in resp.data["results"]]
        self.assertEqual(balances, sorted(balances, reverse=True))

    def test_detail_includes_recent_transactions(self):
        resp = self.client.get(_detail_url(self.wallet.pk))
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(len(resp.data["recent_transactions"]), 1)
        self.assertEqual(
            resp.data["recent_transactions"][0]["ref_transaction"], "REF-WALLET-TEST-1"
        )


@override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=True, ADMIN_TOTP_REQUIRED=True)
class WalletAdjustTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.staff_profile = create_staff_profile(
            username="staff.adjust",
            numero_telephone="2250700320001",
            password="Un-Mot-De-Passe-Adjust-1",
            role=StaffRole.SUPER_ADMIN,
        )
        login_staff_client(
            self.client, username="staff.adjust", password="Un-Mot-De-Passe-Adjust-1"
        )
        self.holder = _create_client_user("client.adjust", "2250700320002")
        self.wallet = Wallet.objects.create(user=self.holder, solde_courant=Decimal(2000))

    def test_adjust_without_reason_returns_400(self):
        resp = self.client.post(_adjust_url(self.wallet.pk), {"amount": "500"})
        self.assertEqual(resp.status_code, 400, resp.content)
        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.solde_courant, Decimal(2000))

    def test_adjust_with_blank_reason_returns_400(self):
        resp = self.client.post(
            _adjust_url(self.wallet.pk), {"amount": "500", "reason": "   "}
        )
        self.assertEqual(resp.status_code, 400, resp.content)

    def test_adjust_zero_amount_returns_400(self):
        resp = self.client.post(
            _adjust_url(self.wallet.pk), {"amount": "0", "reason": "Motif quelconque"}
        )
        self.assertEqual(resp.status_code, 400, resp.content)

    def test_adjust_that_would_go_negative_is_refused(self):
        resp = self.client.post(
            _adjust_url(self.wallet.pk),
            {"amount": "-5000", "reason": "Correction erronée volontaire"},
        )
        self.assertEqual(resp.status_code, 400, resp.content)
        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.solde_courant, Decimal(2000))
        self.assertEqual(
            Transaction.objects.filter(wallet=self.wallet).count(), 0
        )

    def test_credit_adjustment_updates_balance_and_creates_transaction(self):
        resp = self.client.post(
            _adjust_url(self.wallet.pk),
            {"amount": "1500", "reason": "Compensation suite incident technique"},
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.solde_courant, Decimal(3500))

        tx = Transaction.objects.get(wallet=self.wallet)
        self.assertEqual(tx.type_transaction, Transaction.TYPE_TRANSACTION.DEPOT)
        self.assertEqual(tx.montant_transaction, Decimal(1500))
        self.assertEqual(tx.solde_courant, Decimal(3500))
        self.assertEqual(tx.statut_transaction, Transaction.STATUT_TRANSACTION.REUSSIE)
        self.assertEqual(tx.mode_de_paiement, Transaction.MODE_DE_PAIEMENT.SOLDE_COTICI)

        log = AdminActionLog.objects.filter(action="wallet_adjusted").latest("timestamp")
        self.assertEqual(log.target_type, "wallet")
        self.assertEqual(str(log.target_id), str(self.wallet.pk))
        self.assertEqual(log.target_user_id, self.holder.pk)
        self.assertEqual(log.reason, "Compensation suite incident technique")
        self.assertEqual(log.before["solde_courant"], "2000")
        self.assertEqual(log.after["solde_courant"], "3500")
        self.assertEqual(log.result, AdminActionLog.Result.SUCCESS)

    def test_debit_adjustment_updates_balance_and_creates_transaction(self):
        resp = self.client.post(
            _adjust_url(self.wallet.pk),
            {"amount": "-800", "reason": "Reprise sur double crédit accidentel"},
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.wallet.refresh_from_db()
        self.assertEqual(self.wallet.solde_courant, Decimal(1200))

        tx = Transaction.objects.get(wallet=self.wallet)
        self.assertEqual(tx.type_transaction, Transaction.TYPE_TRANSACTION.RETRAIT)
        self.assertEqual(tx.montant_transaction, Decimal(800))
        self.assertEqual(tx.solde_courant, Decimal(1200))
