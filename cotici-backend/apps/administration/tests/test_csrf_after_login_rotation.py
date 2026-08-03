"""Non-régression : la première lecture qui suit une connexion doit passer.

`django.contrib.auth.login` appelle `rotate_token()`, donc le jeton CSRF
change au moment précis où la session s'ouvre. Quand le contrôle CSRF était
appliqué aux lectures, ce `GET /api/admin/me/` partait avec le jeton d'avant
rotation et repartait en 403 : l'interface concluait "pas de session" et
renvoyait l'opérateur sur l'écran de connexion, en boucle.

On vérifie ici les deux faces :
- une lecture juste après connexion aboutit ;
- une écriture avec un jeton CSRF invalide reste refusée.
"""
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.administration.domain.roles import StaffRole
from apps.administration.tests.helpers import create_staff_profile


@override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=True, ADMIN_TOTP_REQUIRED=False)
class CsrfAfterLoginRotationTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient(enforce_csrf_checks=True)
        self.password = "Un-Mot-De-Passe-Fort-11"
        self.profile = create_staff_profile(
            username="staff.csrf",
            numero_telephone="2250700000031",
            password=self.password,
            role=StaffRole.SUPER_ADMIN,
        )

    def _csrf_token(self) -> str:
        self.client.get("/api/admin/auth/csrf/")
        from django.conf import settings

        return self.client.cookies[settings.CSRF_COOKIE_NAME].value

    def test_read_right_after_login_succeeds_despite_token_rotation(self):
        token = self._csrf_token()
        resp = self.client.post(
            "/api/admin/auth/login/",
            {"identifiant": "staff.csrf", "password": self.password},
            format="json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(resp.status_code, 200, resp.content)

        from django.conf import settings

        rotated = self.client.cookies[settings.CSRF_COOKIE_NAME].value
        self.assertNotEqual(token, rotated, "login doit faire tourner le jeton CSRF")

        # Lecture avec le jeton D'AVANT rotation : c'est exactement ce que fait
        # le navigateur dans l'instant qui suit la connexion.
        me = self.client.get("/api/admin/me/", HTTP_X_CSRFTOKEN=token)
        self.assertEqual(me.status_code, 200, me.content)
        self.assertEqual(me.data["username"], "staff.csrf")

        # Et sans aucun jeton.
        self.assertEqual(self.client.get("/api/admin/me/").status_code, 200)

    def test_write_with_invalid_csrf_token_is_still_rejected(self):
        token = self._csrf_token()
        self.client.post(
            "/api/admin/auth/login/",
            {"identifiant": "staff.csrf", "password": self.password},
            format="json",
            HTTP_X_CSRFTOKEN=token,
        )

        other = create_staff_profile(
            username="staff.cible",
            numero_telephone="2250700000032",
            password="Un-Autre-Mot-De-Passe-4",
            role=StaffRole.SUPPORT,
        )
        resp = self.client.patch(
            f"/api/admin/staff/{other.pk}/deactivate/",
            {"reason": "test de protection CSRF"},
            format="json",
            HTTP_X_CSRFTOKEN="jeton-bidon",
        )
        self.assertEqual(resp.status_code, 403, resp.content)
        self.assertIn("CSRF", str(resp.data.get("detail", "")))

        other.refresh_from_db()
        self.assertTrue(other.is_active)
