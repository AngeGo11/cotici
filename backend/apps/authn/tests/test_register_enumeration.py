"""Chantier 1 — fermeture de l'énumération de comptes à l'inscription.

Couvre :
- /request-otp/ (purpose=register) : réponse strictement identique (statut,
  clés, message générique) que le numéro soit déjà inscrit ou non ;
- le SMS envoyé au numéro déjà inscrit ne contient PAS d'OTP exploitable et
  va au propriétaire réel (pas de canal d'exfiltration vers l'appelant) ;
- /verify-otp/ (purpose=register) : le second point de fuite (ancien 409
  "Ce compte existe deja") renvoie désormais la même réponse générique
  qu'un OTP invalide, sans jamais créer de compte en double ;
- le rate limiting de /request-otp/ porte à la fois sur l'IP et sur le
  numéro visé.
"""
import re
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.authn.models import OtpChallenge
from apps.authn.views import REGISTER_OTP_GENERIC_MESSAGE

User = get_user_model()

REQUEST_OTP_URL = "/api/auth/request-otp/"
VERIFY_OTP_URL = "/api/auth/verify-otp/"

OTP_PATTERN = re.compile(r"Votre code COTICI est \d{4}")


class RequestOtpRegisterGenericResponseTests(TestCase):
    def setUp(self):
        # LocMemCache (throttling) n'est pas réinitialisé entre TestCase.
        cache.clear()
        self.client = APIClient()
        self.known_number = "22507090001"
        self.unknown_number = "22507090002"
        User.objects.create_user(
            username=self.known_number, password="testpass123", numero_telephone=self.known_number
        )

    def _post(self, username, password="1234"):
        with mock.patch("apps.authn.views.send_sms", return_value=None):
            return self.client.post(
                REQUEST_OTP_URL,
                {"username": username, "password": password, "purpose": "register"},
                format="json",
            )

    def test_same_status_code_known_and_unknown_number(self):
        known_response = self._post(self.known_number)
        unknown_response = self._post(self.unknown_number)
        self.assertEqual(known_response.status_code, 200)
        self.assertEqual(unknown_response.status_code, 200)

    def test_same_response_keys_known_and_unknown_number(self):
        known_response = self._post(self.known_number)
        unknown_response = self._post(self.unknown_number)
        self.assertEqual(set(known_response.data.keys()), set(unknown_response.data.keys()))

    def test_same_generic_message_known_and_unknown_number(self):
        known_response = self._post(self.known_number)
        unknown_response = self._post(self.unknown_number)
        self.assertEqual(known_response.data["message"], REGISTER_OTP_GENERIC_MESSAGE)
        self.assertEqual(unknown_response.data["message"], REGISTER_OTP_GENERIC_MESSAGE)
        self.assertEqual(known_response.data["message"], unknown_response.data["message"])

    def test_challenge_id_and_expires_in_present_both_cases(self):
        known_response = self._post(self.known_number)
        unknown_response = self._post(self.unknown_number)
        for response in (known_response, unknown_response):
            self.assertIn("challenge_id", response.data)
            self.assertIn("phone_hint", response.data)
            self.assertEqual(response.data["expires_in"], 300)

    def test_no_field_reveals_account_existence(self):
        """Aucun champ annexe (ex: un flag "existing"/"conflict") ne doit
        apparaître dans la réponse pour le cas numéro déjà inscrit."""
        known_response = self._post(self.known_number)
        forbidden_keys = {"existing", "conflict", "already_exists", "user_exists"}
        self.assertTrue(forbidden_keys.isdisjoint(known_response.data.keys()))


class RequestOtpRegisterSmsRoutingTests(TestCase):
    """Vérifie QUEL message est envoyé selon que le numéro est déjà
    inscrit ou non — c'est le vrai mécanisme qui ferme l'énumération (le
    SMS contenant l'OTP ne part jamais vers un numéro déjà pris)."""

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.known_number = "22507090010"
        User.objects.create_user(
            username=self.known_number, password="testpass123", numero_telephone=self.known_number
        )

    def test_existing_number_receives_notice_without_otp_code(self):
        with mock.patch("apps.authn.views.send_sms", return_value=None) as mocked_send:
            response = self.client.post(
                REQUEST_OTP_URL,
                {"username": self.known_number, "password": "1234", "purpose": "register"},
                format="json",
            )
        self.assertEqual(response.status_code, 200)
        mocked_send.assert_called_once()
        called_phone, called_message = mocked_send.call_args[0]
        self.assertEqual(called_phone, self.known_number)
        self.assertNotRegex(called_message, r"\d{4}")
        self.assertIn("deja un compte", called_message)

    def test_unknown_number_receives_real_otp_code(self):
        unknown_number = "22507090011"
        with mock.patch("apps.authn.views.send_sms", return_value=None) as mocked_send:
            response = self.client.post(
                REQUEST_OTP_URL,
                {"username": unknown_number, "password": "1234", "purpose": "register"},
                format="json",
            )
        self.assertEqual(response.status_code, 200)
        mocked_send.assert_called_once()
        called_phone, called_message = mocked_send.call_args[0]
        self.assertEqual(called_phone, unknown_number)
        self.assertRegex(called_message, OTP_PATTERN)

    def test_sms_failure_returns_same_generic_failure_both_cases(self):
        from apps.authn.sms import SmsError

        with mock.patch("apps.authn.views.send_sms", side_effect=SmsError("boom")):
            known_response = self.client.post(
                REQUEST_OTP_URL,
                {"username": self.known_number, "password": "1234", "purpose": "register"},
                format="json",
            )
        cache.clear()
        with mock.patch("apps.authn.views.send_sms", side_effect=SmsError("boom")):
            unknown_response = self.client.post(
                REQUEST_OTP_URL,
                {"username": "22507090012", "password": "1234", "purpose": "register"},
                format="json",
            )
        self.assertEqual(known_response.status_code, 503)
        self.assertEqual(unknown_response.status_code, 503)
        self.assertEqual(known_response.data, unknown_response.data)


class VerifyOtpRegisterConflictLeakTests(TestCase):
    """Le second point de fuite historique (~verify_otp ligne 392) : un
    challenge register pour un numéro déjà inscrit ne doit jamais produire
    de 409 explicite ni créer de doublon, même si (cas quasi impossible en
    pratique) le bon OTP était deviné."""

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.known_number = "22507090020"
        User.objects.create_user(
            username=self.known_number, password="testpass123", numero_telephone=self.known_number
        )

    def test_conflicting_challenge_never_creates_duplicate_user_even_with_correct_code(self):
        with mock.patch("apps.authn.views.secrets.randbelow", return_value=4242):
            with mock.patch("apps.authn.views.send_sms", return_value=None):
                request_response = self.client.post(
                    REQUEST_OTP_URL,
                    {"username": self.known_number, "password": "1234", "purpose": "register"},
                    format="json",
                )
        self.assertEqual(request_response.status_code, 200)
        challenge_id = request_response.data["challenge_id"]
        challenge = OtpChallenge.objects.get(id=challenge_id)
        self.assertEqual(challenge.pending_pin, "")  # purgé, jamais exploitable

        # Même en devinant le bon code (0000 + randbelow patché => "4242"),
        # aucune fuite ni création de doublon.
        verify_response = self.client.post(
            VERIFY_OTP_URL, {"challenge_id": challenge_id, "otp": "4242"}, format="json"
        )
        self.assertEqual(verify_response.status_code, 400)
        self.assertEqual(verify_response.data, {"detail": "OTP invalide."})
        self.assertEqual(User.objects.filter(username=self.known_number).count(), 1)
        self.assertNotIn("access", verify_response.data)
        self.assertNotIn("refresh", verify_response.data)


@override_settings()
class RequestOtpPhoneAndIpThrottleTests(TestCase):
    """Le throttle de /request-otp/ doit porter à la fois sur l'IP
    appelante ET sur le numéro cible (settings.DEFAULT_THROTTLE_RATES:
    otp_request=5/hour par IP, otp_request_phone=5/hour par numéro)."""

    def setUp(self):
        cache.clear()
        self.client = APIClient()

    def test_same_target_number_from_multiple_ips_is_throttled(self):
        target_number = "22507090030"
        statuses = []
        with mock.patch("apps.authn.views.send_sms", return_value=None):
            for i in range(6):
                response = self.client.post(
                    REQUEST_OTP_URL,
                    {"username": target_number, "password": "1234", "purpose": "register"},
                    format="json",
                    REMOTE_ADDR=f"10.0.0.{i}",
                )
                statuses.append(response.status_code)
        # 5 premières autorisées (quota otp_request_phone=5/hour), la 6e
        # bloquée malgré des IP différentes à chaque fois.
        self.assertEqual(statuses[:5], [200] * 5)
        self.assertEqual(statuses[5], 429)

    def test_different_numbers_from_same_ip_still_throttled_by_ip(self):
        statuses = []
        with mock.patch("apps.authn.views.send_sms", return_value=None):
            for i in range(6):
                response = self.client.post(
                    REQUEST_OTP_URL,
                    {
                        "username": f"2250709004{i}",
                        "password": "1234",
                        "purpose": "register",
                    },
                    format="json",
                    REMOTE_ADDR="10.1.1.1",
                )
                statuses.append(response.status_code)
        self.assertEqual(statuses[:5], [200] * 5)
        self.assertEqual(statuses[5], 429)
