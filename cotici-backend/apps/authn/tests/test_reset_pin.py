"""Chantier 2 — flux de réinitialisation du PIN (jeton court à usage
unique).

Couvre :
- le cycle complet request-otp(reset_pin) -> verify-otp -> reset-pin ;
- verify-otp(purpose=reset_pin) ne connecte JAMAIS l'utilisateur (pas de
  JWT) et renvoie un reset_token ;
- reset-pin : jeton rejoué refusé, jeton expiré refusé, jeton d'un autre
  utilisateur sans effet croisé, PIN faible refusé ;
- révocation des refresh tokens existants après reset ;
- journalisation AuditLog (action pin_changed) ;
- consommation atomique du jeton sous appels concurrents.
"""
import threading
from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.db import connection
from django.test import TestCase, TransactionTestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import RefreshToken

from apps.audits.models import AuditLog
from apps.authn.models import OtpChallenge, PinResetToken

User = get_user_model()

REQUEST_OTP_URL = "/api/auth/request-otp/"
VERIFY_OTP_URL = "/api/auth/verify-otp/"
RESET_PIN_URL = "/api/auth/reset-pin/"
REFRESH_URL = "/api/auth/refresh/"


def _create_user(username="22507091000", pin="1111", password="testpass123"):
    user = User.objects.create_user(username=username, password=password, numero_telephone=username)
    user.set_code_pin(pin)
    user.save()
    return user


class ResetPinFullFlowTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.user = _create_user()

    def _obtain_reset_token(self, otp_code="1234"):
        with mock.patch("apps.authn.views.secrets.randbelow", return_value=int(otp_code)):
            with mock.patch("apps.authn.views.send_sms", return_value=None):
                request_response = self.client.post(
                    REQUEST_OTP_URL,
                    {"username": self.user.username, "password": "1111", "purpose": "reset_pin"},
                    format="json",
                )
        self.assertEqual(request_response.status_code, 200, request_response.data)
        challenge_id = request_response.data["challenge_id"]

        verify_response = self.client.post(
            VERIFY_OTP_URL, {"challenge_id": challenge_id, "otp": otp_code}, format="json"
        )
        return verify_response

    def test_verify_otp_reset_pin_does_not_log_in(self):
        verify_response = self._obtain_reset_token()
        self.assertEqual(verify_response.status_code, 200, verify_response.data)
        self.assertNotIn("access", verify_response.data)
        self.assertNotIn("refresh", verify_response.data)
        self.assertIn("reset_token", verify_response.data)

    def test_full_flow_changes_pin(self):
        verify_response = self._obtain_reset_token()
        reset_token = verify_response.data["reset_token"]

        reset_response = self.client.post(
            RESET_PIN_URL, {"reset_token": reset_token, "new_pin": "9999"}, format="json"
        )
        self.assertEqual(reset_response.status_code, 200, reset_response.data)

        self.user.refresh_from_db()
        self.assertTrue(self.user.check_code_pin("9999"))
        self.assertFalse(self.user.check_code_pin("1111"))

    def test_reset_pin_rejects_weak_new_pin(self):
        verify_response = self._obtain_reset_token()
        reset_token = verify_response.data["reset_token"]

        response = self.client.post(
            RESET_PIN_URL, {"reset_token": reset_token, "new_pin": "12"}, format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("new_pin", response.data)

        self.user.refresh_from_db()
        self.assertTrue(self.user.check_code_pin("1111"))  # inchangé

    def test_reset_pin_rejects_non_numeric_new_pin(self):
        verify_response = self._obtain_reset_token()
        reset_token = verify_response.data["reset_token"]

        response = self.client.post(
            RESET_PIN_URL, {"reset_token": reset_token, "new_pin": "abcd"}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_replayed_reset_token_is_rejected(self):
        verify_response = self._obtain_reset_token()
        reset_token = verify_response.data["reset_token"]

        first = self.client.post(
            RESET_PIN_URL, {"reset_token": reset_token, "new_pin": "2222"}, format="json"
        )
        self.assertEqual(first.status_code, 200)

        second = self.client.post(
            RESET_PIN_URL, {"reset_token": reset_token, "new_pin": "3333"}, format="json"
        )
        self.assertEqual(second.status_code, 400)

        self.user.refresh_from_db()
        self.assertTrue(self.user.check_code_pin("2222"))  # pas le second essai

    def test_unknown_reset_token_is_rejected(self):
        response = self.client.post(
            RESET_PIN_URL, {"reset_token": "not-a-real-token", "new_pin": "5555"}, format="json"
        )
        self.assertEqual(response.status_code, 400)

    def test_expired_reset_token_is_rejected(self):
        expired = PinResetToken.objects.create(
            user=self.user,
            token_hash="a" * 64,
            expires_at=timezone.now() - timedelta(seconds=1),
        )
        with mock.patch("apps.authn.views.hashlib.sha256") as mocked_sha:
            mocked_sha.return_value.hexdigest.return_value = expired.token_hash
            response = self.client.post(
                RESET_PIN_URL, {"reset_token": "whatever-raw-value", "new_pin": "5555"}, format="json"
            )
        self.assertEqual(response.status_code, 400)
        expired.refresh_from_db()
        self.assertFalse(expired.is_used)

    def test_reset_token_does_not_affect_other_users_pin(self):
        other_user = _create_user(username="22507091001", pin="4444")

        verify_response = self._obtain_reset_token()
        reset_token = verify_response.data["reset_token"]

        response = self.client.post(
            RESET_PIN_URL, {"reset_token": reset_token, "new_pin": "6666"}, format="json"
        )
        self.assertEqual(response.status_code, 200)

        other_user.refresh_from_db()
        self.assertTrue(other_user.check_code_pin("4444"))  # inchangé

    def test_existing_refresh_tokens_are_revoked_after_reset(self):
        old_refresh = RefreshToken.for_user(self.user)

        verify_response = self._obtain_reset_token()
        reset_token = verify_response.data["reset_token"]
        reset_response = self.client.post(
            RESET_PIN_URL, {"reset_token": reset_token, "new_pin": "7777"}, format="json"
        )
        self.assertEqual(reset_response.status_code, 200)

        refresh_attempt = self.client.post(
            REFRESH_URL, {"refresh": str(old_refresh)}, format="json"
        )
        self.assertEqual(refresh_attempt.status_code, 401)

    def test_audit_log_created_on_pin_reset(self):
        verify_response = self._obtain_reset_token()
        reset_token = verify_response.data["reset_token"]

        before_count = AuditLog.objects.filter(
            user=self.user, action=AuditLog.Action.PIN_CHANGED
        ).count()

        response = self.client.post(
            RESET_PIN_URL, {"reset_token": reset_token, "new_pin": "8888"}, format="json"
        )
        self.assertEqual(response.status_code, 200)

        after_count = AuditLog.objects.filter(
            user=self.user, action=AuditLog.Action.PIN_CHANGED
        ).count()
        self.assertEqual(after_count, before_count + 1)

        entry = AuditLog.objects.filter(user=self.user, action=AuditLog.Action.PIN_CHANGED).latest(
            "timestamp"
        )
        self.assertEqual(entry.status, AuditLog.Status.SUCCESS)


class RequestOtpResetPinEnumerationTests(TestCase):
    """purpose=reset_pin réutilise le même chemin d'authentification que
    purpose=login : la réponse (401, message générique) est donc déjà
    identique que le numéro existe ou non / que le PIN soit correct ou
    non — pas de nouvelle fuite introduite par ce chantier."""

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.user = _create_user(username="22507091010", pin="1234")

    def test_unknown_number_and_wrong_pin_return_identical_error(self):
        unknown = self.client.post(
            REQUEST_OTP_URL,
            {"username": "00000000098", "password": "9999", "purpose": "reset_pin"},
            format="json",
        )
        wrong_pin = self.client.post(
            REQUEST_OTP_URL,
            {"username": self.user.username, "password": "9999", "purpose": "reset_pin"},
            format="json",
        )
        self.assertEqual(unknown.status_code, 401)
        self.assertEqual(wrong_pin.status_code, 401)
        self.assertEqual(unknown.data, wrong_pin.data)


class ResetPinThrottleTests(TestCase):
    def setUp(self):
        cache.clear()
        self.client = APIClient()

    def test_reset_pin_endpoint_is_throttled(self):
        statuses = []
        for _ in range(11):
            response = self.client.post(
                RESET_PIN_URL, {"reset_token": "garbage", "new_pin": "1234"}, format="json"
            )
            statuses.append(response.status_code)
        self.assertIn(429, statuses)
        # Toutes les réponses avant blocage doivent être des 400 (jeton
        # invalide), jamais un 500.
        self.assertTrue(all(code in (400, 429) for code in statuses))


class ResetPinConcurrencyTests(TransactionTestCase):
    """Un double appel concurrent avec le MÊME reset_token ne doit
    jamais changer le PIN deux fois : seul l'un des deux appels doit
    réussir, l'autre doit échouer proprement (grâce à select_for_update)."""

    def setUp(self):
        cache.clear()

    def test_concurrent_reset_pin_calls_only_one_succeeds(self):
        user = _create_user(username="22507091020", pin="1111")

        with mock.patch("apps.authn.views.secrets.randbelow", return_value=1234):
            with mock.patch("apps.authn.views.send_sms", return_value=None):
                client = APIClient()
                request_response = client.post(
                    REQUEST_OTP_URL,
                    {"username": user.username, "password": "1111", "purpose": "reset_pin"},
                    format="json",
                )
        challenge_id = request_response.data["challenge_id"]
        verify_response = client.post(
            VERIFY_OTP_URL, {"challenge_id": challenge_id, "otp": "1234"}, format="json"
        )
        reset_token = verify_response.data["reset_token"]

        results = []

        def _call_reset_pin(new_pin):
            thread_client = APIClient()
            response = thread_client.post(
                RESET_PIN_URL,
                {"reset_token": reset_token, "new_pin": new_pin},
                format="json",
            )
            results.append(response.status_code)
            connection.close()

        t1 = threading.Thread(target=_call_reset_pin, args=("2222",))
        t2 = threading.Thread(target=_call_reset_pin, args=("3333",))
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        self.assertEqual(sorted(results), [200, 400])

        user.refresh_from_db()
        self.assertTrue(user.check_code_pin("2222") or user.check_code_pin("3333"))
        self.assertFalse(user.check_code_pin("1111"))
        # Un seul des deux nouveaux PIN a été appliqué, jamais les deux.
        self.assertNotEqual(user.check_code_pin("2222"), user.check_code_pin("3333"))
