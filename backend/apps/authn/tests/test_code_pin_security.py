from unittest import mock

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from rest_framework.test import APIClient
from rest_framework.throttling import ScopedRateThrottle

User = get_user_model()


class CodePinHashingTests(TestCase):
    def test_set_code_pin_never_stores_plaintext(self):
        user = User(username="22507080910", numero_telephone="22507080910")
        user.set_password("1234")
        user.set_code_pin("1234")
        user.save()

        self.assertNotEqual(user.code_pin, "1234")
        self.assertTrue(user.check_code_pin("1234"))
        self.assertFalse(user.check_code_pin("0000"))

    def test_register_serializer_hashes_code_pin(self):
        from apps.authn.serializers import RegisterSerializer

        serializer = RegisterSerializer(
            data={
                "numero_telephone": "22507080911",
                "password": "somepassword",
                "code_pin": "5678",
            }
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        user = serializer.save()

        self.assertNotEqual(user.code_pin, "5678")
        self.assertTrue(user.check_code_pin("5678"))

    def test_register_serializer_rejects_non_numeric_pin(self):
        from apps.authn.serializers import RegisterSerializer

        serializer = RegisterSerializer(
            data={
                "numero_telephone": "22507080912",
                "password": "somepassword",
                "code_pin": "abcd",
            }
        )
        self.assertFalse(serializer.is_valid())
        self.assertIn("code_pin", serializer.errors)


class OtpRequestThrottleTests(TestCase):
    def setUp(self):
        # Le cache (LocMemCache par défaut) porteur des compteurs
        # ScopedRateThrottle n'est pas remis à zéro entre TestCase : on le
        # vide explicitement pour ne pas dépendre de l'ordre d'exécution des
        # tests du module (voir aussi apps/authn/tests/test_auth_flows.py).
        cache.clear()
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="22507080920",
            password="testpass123",
            numero_telephone="22507080920",
        )
        self.user.set_code_pin("1234")
        self.user.save()

    def test_request_otp_is_throttled_after_configured_rate(self):
        # ScopedRateThrottle.THROTTLE_RATES is snapshotted as a class attribute at
        # import time, so overriding settings.REST_FRAMEWORK in a test has no effect
        # on it (a known DRF quirk) — patch the dict in place instead.
        with mock.patch.dict(ScopedRateThrottle.THROTTLE_RATES, {"otp_request": "2/hour"}):
            payload = {"username": "22507080920", "password": "testpass123", "purpose": "login"}
            first = self.client.post("/api/auth/request-otp/", payload, format="json")
            second = self.client.post("/api/auth/request-otp/", payload, format="json")
            third = self.client.post("/api/auth/request-otp/", payload, format="json")

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(third.status_code, 429)


class ResendOtpValidationTests(TestCase):
    def setUp(self):
        cache.clear()

    def test_resend_otp_requires_valid_uuid(self):
        client = APIClient()
        response = client.post("/api/auth/resend-otp/", {"challenge_id": "not-a-uuid"}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_resend_otp_requires_challenge_id(self):
        client = APIClient()
        response = client.post("/api/auth/resend-otp/", {}, format="json")
        self.assertEqual(response.status_code, 400)
