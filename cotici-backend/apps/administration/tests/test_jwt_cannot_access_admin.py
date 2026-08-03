"""Un JWT (mobile) valide ne doit JAMAIS donner accès à `/api/admin/`,
même émis pour un `User` possédant un `StaffProfile` actif : le back-office
n'accepte que la session dédiée (voir `AdminSessionAuthentication`)."""
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.administration.domain.roles import StaffRole
from apps.administration.tests.helpers import create_staff_profile, login_staff_client


@override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=True, ADMIN_TOTP_REQUIRED=True)
class JwtCannotAccessAdminTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.password = "Un-Mot-De-Passe-Fort-2"
        self.profile = create_staff_profile(
            username="staff.jwt",
            numero_telephone="2250700000002",
            password=self.password,
            role=StaffRole.SUPER_ADMIN,
        )

    def test_bearer_jwt_is_explicitly_rejected_on_me_endpoint(self):
        token = RefreshToken.for_user(self.profile.user)
        resp = self.client.get(
            "/api/admin/me/", HTTP_AUTHORIZATION=f"Bearer {token.access_token}"
        )
        # `AdminSessionAuthentication` ne fournit pas de challenge
        # `WWW-Authenticate` (comme `SessionAuthentication` standard) : DRF
        # traduit alors un échec d'authentification en 403 plutôt qu'en 401 —
        # ce qui reste un refus d'accès sans équivoque.
        self.assertEqual(resp.status_code, 403)

    def test_bearer_jwt_is_rejected_even_with_valid_admin_session(self):
        # Établit une VRAIE session admin, puis tente malgré tout de fournir
        # un header Bearer sur la même requête : doit toujours être rejeté
        # (le header Bearer est un motif de rejet explicite et prioritaire).
        login_staff_client(self.client, username="staff.jwt", password=self.password)
        token = RefreshToken.for_user(self.profile.user)
        resp = self.client.get(
            "/api/admin/me/", HTTP_AUTHORIZATION=f"Bearer {token.access_token}"
        )
        # `AdminSessionAuthentication` ne fournit pas de challenge
        # `WWW-Authenticate` (comme `SessionAuthentication` standard) : DRF
        # traduit alors un échec d'authentification en 403 plutôt qu'en 401 —
        # ce qui reste un refus d'accès sans équivoque.
        self.assertEqual(resp.status_code, 403)

    def test_jwt_authenticated_mobile_endpoint_still_works(self):
        # Non-régression : le JWT continue de fonctionner normalement sur le
        # périmètre mobile (hors /api/admin/).
        token = RefreshToken.for_user(self.profile.user)
        resp = self.client.get(
            "/api/auth/me/", HTTP_AUTHORIZATION=f"Bearer {token.access_token}"
        )
        self.assertEqual(resp.status_code, 200)
