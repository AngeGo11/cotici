from unittest import mock

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework.throttling import ScopedRateThrottle

from apps.authn.models import OtpChallenge

User = get_user_model()


class PendingPinPurgeTests(TestCase):
    """Régression : OtpChallenge.pending_pin restait en clair en base indéfiniment,
    y compris après la création du compte (le PIN hashé était déjà sur le User)."""

    def setUp(self):
        # Voir commentaire équivalent dans test_code_pin_security.py : le
        # cache porteur des compteurs ScopedRateThrottle est global au
        # process de test, pas réinitialisé entre TestCase.
        cache.clear()
        self.client = APIClient()

    def _register_and_get_challenge(self, phone="22507080930", pin="4321"):
        with mock.patch("apps.authn.views.secrets.randbelow", return_value=int(pin)):
            response = self.client.post(
                "/api/auth/request-otp/",
                {"username": phone, "password": pin, "purpose": "register"},
                format="json",
            )
        self.assertEqual(response.status_code, 200)
        challenge_id = response.data["challenge_id"]
        challenge = OtpChallenge.objects.get(id=challenge_id)
        self.assertEqual(challenge.pending_pin, pin)  # en clair jusqu'à vérification
        return challenge_id, pin

    def test_pending_pin_cleared_after_successful_verification(self):
        challenge_id, pin = self._register_and_get_challenge()

        response = self.client.post(
            "/api/auth/verify-otp/",
            {"challenge_id": challenge_id, "otp": pin},
            format="json",
        )
        self.assertEqual(response.status_code, 200)

        challenge = OtpChallenge.objects.get(id=challenge_id)
        self.assertEqual(challenge.pending_pin, "")

        user = User.objects.get(username="22507080930")
        self.assertTrue(user.check_code_pin(pin))
        self.assertNotEqual(user.code_pin, pin)


class LoginThrottleTests(TestCase):
    """Régression : /authn/login/ (TokenObtainPairView) n'avait aucun throttle,
    alors que pour les comptes créés par OTP, password == PIN à 4 chiffres — un
    chemin de bruteforce du PIN qui contourne entièrement l'OTP."""

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="22507080931", password="1234", numero_telephone="22507080931"
        )
        self.user.set_code_pin("1234")
        self.user.save()

    def test_login_is_throttled_after_configured_rate(self):
        with mock.patch.dict(ScopedRateThrottle.THROTTLE_RATES, {"login_attempt": "2/hour"}):
            payload = {"username": "22507080931", "password": "wrong"}
            first = self.client.post("/api/auth/login/", payload, format="json")
            second = self.client.post("/api/auth/login/", payload, format="json")
            third = self.client.post("/api/auth/login/", payload, format="json")

        self.assertEqual(first.status_code, 401)
        self.assertEqual(second.status_code, 401)
        self.assertEqual(third.status_code, 429)

    def test_login_still_works_within_rate(self):
        response = self.client.post(
            "/api/auth/login/", {"username": "22507080931", "password": "1234"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)
