"""Contrôle d'accès par rôle sur l'ensemble des endpoints `/api/admin/` :

- un utilisateur "mobile" ordinaire (aucun `StaffProfile`) doit être refusé
  sur TOUS les endpoints, même une fois authentifié via une session Django
  valide (`force_login`) ;
- un membre du staff authentifié mais dont le rôle ne détient pas
  `Perm.STAFF_MANAGE` (operateur, support, auditeur, compliance) doit être
  refusé sur TOUS les endpoints `/staff/*` (lecture ET écriture) ;
- toute tentative d'écriture refusée par un utilisateur authentifié doit
  malgré tout être journalisée dans `AdminActionLog` (voir
  `AdminAuditTrailMiddleware`), y compris quand l'auteur n'est pas un membre
  du staff.
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.administration.domain.roles import StaffRole
from apps.administration.tests.helpers import create_staff_profile, login_staff_client
from apps.audits.models import AdminActionLog

User = get_user_model()


def _write_endpoints(target_pk):
    """Tous les endpoints d'écriture exposés par le module `administration`."""
    return [
        ("post", "/api/admin/staff/", {
            "username": "should.not.exist",
            "numero_telephone": "2250700009999",
            "password": "Un-Mot-De-Passe-Quelconque-9",
            "role": StaffRole.SUPPORT,
        }),
        ("patch", f"/api/admin/staff/{target_pk}/deactivate/", {"reason": "test"}),
        ("patch", f"/api/admin/staff/{target_pk}/role/", {"role": StaffRole.SUPPORT, "reason": "test"}),
        ("patch", f"/api/admin/staff/{target_pk}/reset-totp/", {"reason": "test"}),
        ("patch", f"/api/admin/staff/{target_pk}/reactivate/", {"reason": "test"}),
    ]


def _read_endpoints():
    return [
        ("get", "/api/admin/me/"),
        ("get", "/api/admin/audit/"),
        ("get", "/api/admin/staff/"),
    ]


@override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=True, ADMIN_TOTP_REQUIRED=True)
class NonStaffUserDeniedEverywhereTests(TestCase):
    """Un utilisateur mobile ordinaire (aucun `StaffProfile`) ne doit jamais
    pouvoir accéder à `/api/admin/`, même avec une session Django valide."""

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        # Cible existante pour les actions détail (peu importe qu'elle
        # n'appartienne pas à l'attaquant : il doit être refusé avant même
        # que l'objet ne soit résolu).
        self.target = create_staff_profile(
            username="staff.target.rbac",
            numero_telephone="2250700100001",
            password="Un-Mot-De-Passe-Cible-1",
            role=StaffRole.SUPER_ADMIN,
        )
        self.mobile_user = User.objects.create_user(
            username="mobile_user_rbac",
            password="testpass123",
            code_pin="1234",
            numero_telephone="2250700100002",
        )
        # Simule une session Django valide pour ce user (ex : cookie volé,
        # confusion de session) : `AdminSessionAuthentication` doit malgré
        # tout refuser, faute de `StaffProfile` actif + TOTP confirmé.
        self.client.force_login(self.mobile_user)

    def test_denied_on_every_read_endpoint(self):
        for method, url in _read_endpoints():
            with self.subTest(url=url):
                resp = getattr(self.client, method)(url)
                self.assertEqual(resp.status_code, 403, f"{method.upper()} {url} -> {resp.status_code}")

    def test_denied_on_every_write_endpoint(self):
        for method, url, payload in _write_endpoints(self.target.pk):
            with self.subTest(url=url):
                resp = getattr(self.client, method)(url, payload, format="json")
                self.assertEqual(resp.status_code, 403, f"{method.upper()} {url} -> {resp.status_code}")

    def test_denied_write_is_still_journalized(self):
        """Même un utilisateur non-staff authentifié qui tente une écriture
        refusée doit laisser une trace dans `AdminActionLog` (l'acteur d'un
        `AdminActionLog` est n'importe quel `User` authentifié, pas
        nécessairement un membre du staff — voir `AdminAuditTrailMiddleware`)."""
        before_count = AdminActionLog.objects.count()
        resp = self.client.post(
            "/api/admin/staff/",
            {
                "username": "should.not.exist.2",
                "numero_telephone": "2250700100003",
                "password": "Un-Mot-De-Passe-Quelconque-8",
                "role": StaffRole.SUPPORT,
            },
            format="json",
        )
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(AdminActionLog.objects.count(), before_count + 1)
        entry = AdminActionLog.objects.latest("timestamp")
        self.assertEqual(entry.actor_id, self.mobile_user.id)
        self.assertEqual(entry.result, AdminActionLog.Result.DENIED)
        self.assertEqual(entry.status_code, 403)

    def test_target_staff_profile_untouched(self):
        for method, url, payload in _write_endpoints(self.target.pk):
            getattr(self.client, method)(url, payload, format="json")
        self.target.refresh_from_db()
        self.assertTrue(self.target.is_active)
        self.assertEqual(self.target.role, StaffRole.SUPER_ADMIN)
        self.assertFalse(User.objects.filter(username="should.not.exist").exists())


@override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=True, ADMIN_TOTP_REQUIRED=True)
class AnonymousDeniedEverywhereTests(TestCase):
    """Sans aucune session, tout endpoint `/api/admin/` doit refuser l'accès."""

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.target = create_staff_profile(
            username="staff.target.anon",
            numero_telephone="2250700100010",
            password="Un-Mot-De-Passe-Cible-2",
            role=StaffRole.SUPER_ADMIN,
        )

    def test_denied_on_every_read_endpoint(self):
        for method, url in _read_endpoints():
            with self.subTest(url=url):
                resp = getattr(self.client, method)(url)
                self.assertIn(resp.status_code, (401, 403), f"{method.upper()} {url} -> {resp.status_code}")

    def test_denied_on_every_write_endpoint(self):
        for method, url, payload in _write_endpoints(self.target.pk):
            with self.subTest(url=url):
                resp = getattr(self.client, method)(url, payload, format="json")
                self.assertIn(resp.status_code, (401, 403), f"{method.upper()} {url} -> {resp.status_code}")


@override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=True, ADMIN_TOTP_REQUIRED=True)
class StaffWithoutManagePermissionDeniedOnStaffEndpointsTests(TestCase):
    """Un membre du staff légitime (session admin valide, TOTP confirmé) mais
    dont le rôle ne détient pas `Perm.STAFF_MANAGE` doit être refusé sur
    TOUS les endpoints `/staff/*`, y compris la simple lecture (liste)."""

    NON_MANAGE_ROLES = [
        StaffRole.OPERATEUR,
        StaffRole.SUPPORT,
        StaffRole.AUDITEUR,
        StaffRole.COMPLIANCE,
    ]

    def setUp(self):
        cache.clear()
        self.target = create_staff_profile(
            username="staff.target.perms",
            numero_telephone="2250700100020",
            password="Un-Mot-De-Passe-Cible-3",
            role=StaffRole.SUPER_ADMIN,
        )

    def _client_for_role(self, role: str) -> APIClient:
        # Chaque appel effectue un login complet (login + totp/setup +
        # totp/verify) : sans purger le cache entre deux rôles, le throttle
        # `admin_login`/`admin_totp` (par IP, partagée par tous les clients
        # de test) finirait par bloquer les tentatives suivantes.
        cache.clear()
        username = f"staff.{role}"
        password = "Un-Mot-De-Passe-Role-1"
        create_staff_profile(
            username=username,
            numero_telephone=f"22507002{StaffWithoutManagePermissionDeniedOnStaffEndpointsTests.NON_MANAGE_ROLES.index(role):05d}",
            password=password,
            role=role,
        )
        client = APIClient()
        login_staff_client(client, username=username, password=password)
        return client

    def test_each_non_manage_role_is_denied_on_staff_list(self):
        for role in self.NON_MANAGE_ROLES:
            with self.subTest(role=role):
                client = self._client_for_role(role)
                resp = client.get("/api/admin/staff/")
                self.assertEqual(resp.status_code, 403, f"role={role} -> {resp.status_code}")

    def test_each_non_manage_role_is_denied_on_staff_writes(self):
        for role in self.NON_MANAGE_ROLES:
            with self.subTest(role=role):
                client = self._client_for_role(role)
                for method, url, payload in _write_endpoints(self.target.pk):
                    resp = getattr(client, method)(url, payload, format="json")
                    self.assertEqual(
                        resp.status_code, 403,
                        f"role={role} {method.upper()} {url} -> {resp.status_code}",
                    )

    def test_target_untouched_after_all_denied_attempts(self):
        for role in self.NON_MANAGE_ROLES:
            client = self._client_for_role(role)
            for method, url, payload in _write_endpoints(self.target.pk):
                getattr(client, method)(url, payload, format="json")
        self.target.refresh_from_db()
        self.assertTrue(self.target.is_active)
        self.assertEqual(self.target.role, StaffRole.SUPER_ADMIN)

    def test_super_admin_role_can_access_staff_list(self):
        """Non-régression : contrairement aux autres rôles, super_admin doit
        pouvoir lister le staff (seul rôle détenant `Perm.STAFF_MANAGE`)."""
        password = "Un-Mot-De-Passe-Super-1"
        create_staff_profile(
            username="staff.super.rbac",
            numero_telephone="2250700100099",
            password=password,
            role=StaffRole.SUPER_ADMIN,
        )
        client = APIClient()
        login_staff_client(client, username="staff.super.rbac", password=password)
        resp = client.get("/api/admin/staff/")
        self.assertEqual(resp.status_code, 200)
