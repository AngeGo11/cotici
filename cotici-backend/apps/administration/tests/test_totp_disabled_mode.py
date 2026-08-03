"""Mode `ADMIN_TOTP_REQUIRED=False` (développement uniquement) : la session
est ouverte dès la validation du mot de passe.

Ces tests verrouillent les deux propriétés qui comptent :
- désactivé, le second facteur est bien court-circuité ;
- le défaut reste `True`, pour qu'un réglage absent ne désactive JAMAIS la 2FA
  silencieusement.
"""
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.administration.domain.roles import StaffRole
from apps.administration.services import auth_service
from apps.administration.tests.helpers import create_staff_profile


@override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=True, ADMIN_TOTP_REQUIRED=False)
class TotpDisabledModeTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.password = "Un-Mot-De-Passe-Fort-9"
        self.profile = create_staff_profile(
            username="staff.nototp",
            numero_telephone="2250700000021",
            password=self.password,
            role=StaffRole.SUPER_ADMIN,
        )

    def test_login_opens_session_without_totp(self):
        resp = self.client.post(
            "/api/admin/auth/login/",
            {"identifiant": "staff.nototp", "password": self.password},
            format="json",
        )
        self.assertEqual(resp.status_code, 200, resp.content)
        self.assertTrue(resp.data["session_established"])
        self.assertFalse(resp.data["totp_setup_required"])
        # Aucun cookie de pré-authentification : il n'y a plus d'étape suivante.
        self.assertNotIn(auth_service.PREAUTH_COOKIE_NAME, resp.cookies)

        # La session est immédiatement exploitable sur une vue protégée, alors
        # même que `totp_confirmed_at` est resté nul.
        me = self.client.get("/api/admin/me/")
        self.assertEqual(me.status_code, 200, me.content)
        self.assertEqual(me.data["username"], "staff.nototp")

        self.profile.refresh_from_db()
        self.assertIsNone(self.profile.totp_confirmed_at)

    def test_bad_password_is_still_rejected(self):
        resp = self.client.post(
            "/api/admin/auth/login/",
            {"identifiant": "staff.nototp", "password": "mauvais-mot-de-passe"},
            format="json",
        )
        self.assertEqual(resp.status_code, 401)
        self.assertEqual(self.client.get("/api/admin/me/").status_code, 403)

    def test_inactive_profile_is_still_rejected(self):
        self.profile.is_active = False
        self.profile.save(update_fields=["is_active"])
        resp = self.client.post(
            "/api/admin/auth/login/",
            {"identifiant": "staff.nototp", "password": self.password},
            format="json",
        )
        self.assertEqual(resp.status_code, 401)


class TotpRequiredByDefaultTests(TestCase):
    """Le réglage absent doit valoir `True` : pas de désactivation implicite."""

    @override_settings()
    def test_missing_setting_defaults_to_required(self):
        from django.conf import settings

        del settings.ADMIN_TOTP_REQUIRED
        self.assertTrue(auth_service._totp_required())
