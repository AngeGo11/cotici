"""Module utilisateurs finaux du back-office (`/api/admin/users/`).

Ce fichier protège surtout la frontière PII : la liste et la fiche ne
doivent jamais laisser fuiter un numéro de téléphone en clair, et la seule
voie de révélation doit être motivée, permissionnée et tracée.
"""
from __future__ import annotations

from decimal import Decimal

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.token_blacklist.models import (
    BlacklistedToken,
    OutstandingToken,
)
from rest_framework_simplejwt.tokens import RefreshToken

from apps.administration.domain.audit_actions import (
    USER_PII_REVEALED,
    USER_SUSPENDED,
)
from apps.administration.domain.roles import StaffRole
from apps.administration.tests.helpers import create_staff_profile, login_staff_client
from apps.audits.models import AdminActionLog
from apps.wallet.models import Wallet

User = get_user_model()

LIST_URL = "/api/admin/users/"

PHONE = "2250700300010"


def _create_user(username: str, phone: str, **kwargs) -> User:
    return User.objects.create_user(
        username=username,
        password="testpass123",
        code_pin="1234",
        numero_telephone=phone,
        **kwargs,
    )


def _login(client: APIClient, *, role: str, suffix: str):
    username = f"staff.users.{suffix}"
    password = "Un-Mot-De-Passe-Users-1"
    create_staff_profile(
        username=username,
        numero_telephone=f"22507004{suffix.zfill(5)}",
        password=password,
        role=role,
    )
    login_staff_client(client, username=username, password=password)


@override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=True, ADMIN_TOTP_REQUIRED=True)
class UserListTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        _login(self.client, role=StaffRole.SUPPORT, suffix="1")
        self.user = _create_user(
            "client.list",
            PHONE,
            first_name="Awa",
            last_name="Traore",
            email="awa.traore@example.com",
        )
        Wallet.objects.create(user=self.user, solde_courant=Decimal(4500))

    def test_list_never_exposes_raw_pii(self):
        resp = self.client.get(LIST_URL)
        self.assertEqual(resp.status_code, 200, resp.content)
        body = resp.content.decode()
        self.assertNotIn(PHONE, body)
        self.assertNotIn("awa.traore@example.com", body)

        row = resp.data["results"][0]
        self.assertTrue(row["numero_telephone_masque"].startswith("225"))
        self.assertTrue(row["numero_telephone_masque"].endswith(PHONE[-2:]))
        self.assertEqual(Decimal(str(row["solde_courant"])), Decimal(4500))

    def test_staff_accounts_are_not_listed(self):
        """Les comptes back-office relèvent de /api/admin/staff/."""
        resp = self.client.get(LIST_URL)
        usernames = [row["username"] for row in resp.data["results"]]
        self.assertEqual(usernames, ["client.list"])

    def test_search_by_phone_requires_exact_match(self):
        """Une recherche partielle sur un numéro permettrait d'énumérer les
        clients par préfixe : seul le numéro complet doit matcher."""
        partial = self.client.get(LIST_URL, {"search": PHONE[:6]})
        self.assertEqual(partial.data["count"], 0)

        exact = self.client.get(LIST_URL, {"search": PHONE})
        self.assertEqual(exact.data["count"], 1)

    def test_search_by_name(self):
        resp = self.client.get(LIST_URL, {"search": "awa"})
        self.assertEqual(resp.data["count"], 1)

    def test_filter_by_status(self):
        _create_user("client.suspendu", "2250700300011", is_active=False)
        self.assertEqual(self.client.get(LIST_URL, {"statut": "actif"}).data["count"], 1)
        self.assertEqual(
            self.client.get(LIST_URL, {"statut": "suspendu"}).data["count"], 1
        )

    def test_unknown_ordering_falls_back_to_default(self):
        """Un tri hors liste blanche ne doit pas atteindre `order_by`."""
        resp = self.client.get(LIST_URL, {"ordering": "code_pin"})
        self.assertEqual(resp.status_code, 200, resp.content)

    def test_detail_exposes_counters_without_pii(self):
        resp = self.client.get(f"{LIST_URL}{self.user.pk}/")
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertNotIn(PHONE, resp.content.decode())
        self.assertTrue(resp.data["a_un_portefeuille"])
        self.assertEqual(resp.data["transactions_count"], 0)


@override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=True, ADMIN_TOTP_REQUIRED=True)
class UserSuspensionTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        _login(self.client, role=StaffRole.OPERATEUR, suffix="2")
        self.user = _create_user("client.suspend", "2250700300020")

    def _url(self, action: str) -> str:
        return f"{LIST_URL}{self.user.pk}/{action}/"

    def test_suspension_requires_a_reason(self):
        resp = self.client.post(self._url("suspend"), {}, format="json")
        self.assertEqual(resp.status_code, 400, resp.content)
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_active)

    def test_suspension_deactivates_and_is_journalized(self):
        resp = self.client.post(
            self._url("suspend"), {"reason": "Fraude suspectée"}, format="json"
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.user.refresh_from_db()
        self.assertFalse(self.user.is_active)

        entry = AdminActionLog.objects.latest("timestamp")
        self.assertEqual(entry.action, USER_SUSPENDED)
        self.assertEqual(entry.target_user_id, self.user.pk)
        self.assertEqual(entry.reason, "Fraude suspectée")

    def test_suspension_revokes_outstanding_refresh_tokens(self):
        """Sans révocation, un refresh token déjà émis survivrait à la
        suspension et le compte resterait utilisable."""
        RefreshToken.for_user(self.user)
        token_id = OutstandingToken.objects.filter(user=self.user).first().id
        self.assertFalse(BlacklistedToken.objects.filter(token_id=token_id).exists())

        self.client.post(self._url("suspend"), {"reason": "Fraude"}, format="json")
        self.assertTrue(BlacklistedToken.objects.filter(token_id=token_id).exists())

    def test_reactivation_restores_access(self):
        self.client.post(self._url("suspend"), {"reason": "Erreur"}, format="json")
        resp = self.client.post(
            self._url("reactivate"), {"reason": "Levée de doute"}, format="json"
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_active)

    def test_staff_account_cannot_be_suspended_here(self):
        """Un compte staff ne se désactive que via /api/admin/staff/, qui
        interdit l'auto-modification."""
        colleague = create_staff_profile(
            username="staff.cible.users",
            numero_telephone="2250700300099",
            password="Un-Mot-De-Passe-Cible-2",
            role=StaffRole.SUPPORT,
        )
        resp = self.client.post(
            f"{LIST_URL}{colleague.user_id}/suspend/",
            {"reason": "Tentative"},
            format="json",
        )
        # Le compte staff est exclu du queryset : il est introuvable ici.
        self.assertIn(resp.status_code, (403, 404), resp.content)
        colleague.user.refresh_from_db()
        self.assertTrue(colleague.user.is_active)

    def test_support_role_cannot_suspend(self):
        support_client = APIClient()
        _login(support_client, role=StaffRole.SUPPORT, suffix="3")
        resp = support_client.post(
            self._url("suspend"), {"reason": "Tentative"}, format="json"
        )
        self.assertEqual(resp.status_code, 403, resp.content)
        self.user.refresh_from_db()
        self.assertTrue(self.user.is_active)


@override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=True, ADMIN_TOTP_REQUIRED=True)
class RevealPiiTests(TestCase):
    def setUp(self):
        cache.clear()
        self.user = _create_user(
            "client.pii",
            "2250700300030",
            email="pii@example.com",
            first_name="Koffi",
        )

    def _client(self, role: str, suffix: str) -> APIClient:
        client = APIClient()
        _login(client, role=role, suffix=suffix)
        return client

    def test_compliance_can_reveal_with_a_reason(self):
        client = self._client(StaffRole.COMPLIANCE, "4")
        resp = client.post(
            f"{LIST_URL}{self.user.pk}/reveal-pii/",
            {"reason": "Demande judiciaire n°42"},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertEqual(resp.data["numero_telephone"], "2250700300030")
        self.assertEqual(resp.data["email"], "pii@example.com")

    def test_reveal_is_journalized_without_storing_the_values(self):
        client = self._client(StaffRole.COMPLIANCE, "5")
        client.post(
            f"{LIST_URL}{self.user.pk}/reveal-pii/",
            {"reason": "Demande judiciaire"},
            format="json",
        )
        entry = AdminActionLog.objects.latest("timestamp")
        self.assertEqual(entry.action, USER_PII_REVEALED)
        self.assertEqual(entry.target_user_id, self.user.pk)
        # Le journal ne doit pas devenir lui-même un export de PII en clair.
        self.assertNotIn("2250700300030", str(entry.after))
        self.assertNotIn("pii@example.com", str(entry.after))

    def test_reveal_requires_a_reason(self):
        client = self._client(StaffRole.COMPLIANCE, "6")
        resp = client.post(f"{LIST_URL}{self.user.pk}/reveal-pii/", {}, format="json")
        self.assertEqual(resp.status_code, 400, resp.content)

    def test_support_cannot_reveal(self):
        client = self._client(StaffRole.SUPPORT, "7")
        resp = client.post(
            f"{LIST_URL}{self.user.pk}/reveal-pii/",
            {"reason": "Curiosité"},
            format="json",
        )
        self.assertEqual(resp.status_code, 403, resp.content)

    def test_auditor_cannot_reveal(self):
        client = self._client(StaffRole.AUDITEUR, "8")
        resp = client.post(
            f"{LIST_URL}{self.user.pk}/reveal-pii/",
            {"reason": "Contrôle"},
            format="json",
        )
        self.assertEqual(resp.status_code, 403, resp.content)


@override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=True, ADMIN_TOTP_REQUIRED=True)
class UserAccessControlTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()

    def test_anonymous_is_denied(self):
        self.assertEqual(self.client.get(LIST_URL).status_code, 403)

    def test_authenticated_non_staff_is_denied(self):
        mobile_user = _create_user("mobile.users", "2250700300040")
        self.client.force_login(mobile_user)
        self.assertEqual(self.client.get(LIST_URL).status_code, 403)
