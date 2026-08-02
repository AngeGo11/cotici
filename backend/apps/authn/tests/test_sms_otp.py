from unittest import mock

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.authn.models import OtpChallenge
from apps.authn.sms import SmsError, send_sms

User = get_user_model()


def _cinetpay_success_payload(message_id="msg-123"):
    return {
        "messages": [
            {
                "to": "2250758712792",
                "status": {
                    "groupId": 1,
                    "groupName": "PENDING",
                    "id": 7,
                    "name": "PENDING_ENROUTE",
                    "description": "Message accepted",
                },
                "messageId": message_id,
                "smsCount": 1,
            }
        ]
    }


def _mock_response(status_code=200, json_payload=None):
    response = mock.Mock()
    response.status_code = status_code
    response.json.return_value = json_payload or {}
    response.text = str(json_payload)
    return response


class SendSmsConsoleProviderTests(TestCase):
    """Mode dev : le message (donc le code OTP) est loggé, aucun appel réseau."""

    @override_settings(SMS_PROVIDER="console")
    def test_console_provider_logs_message_without_network_call(self):
        with mock.patch("apps.authn.sms.requests.post") as mocked_post:
            with self.assertLogs("apps.authn.sms", level="WARNING") as logs:
                send_sms("22507080930", "Votre code COTICI est 1234.")
        mocked_post.assert_not_called()
        self.assertTrue(any("1234" in line for line in logs.output))


@override_settings(
    SMS_PROVIDER="cinetpay",
    CINETPAY_SMS_API_KEY="test-api-key",
    CINETPAY_SMS_SENDER="COTICI",
)
class SendSmsCinetPayProviderTests(TestCase):
    def test_success_calls_api_with_expected_request(self):
        response = _mock_response(200, _cinetpay_success_payload())
        with mock.patch("apps.authn.sms.requests.post", return_value=response) as mocked_post:
            send_sms("+225 07 08 09 30", "Votre code COTICI est 1234. Il expire dans 5 minutes.")

        mocked_post.assert_called_once()
        _, kwargs = mocked_post.call_args
        self.assertEqual(kwargs["headers"]["Authorization"], "App test-api-key")
        self.assertEqual(kwargs["json"]["from"], "COTICI")
        self.assertEqual(kwargs["json"]["to"], ["22507080930"])
        self.assertEqual(kwargs["timeout"], 10)

    def test_no_otp_code_leaked_in_logs_on_success(self):
        response = _mock_response(200, _cinetpay_success_payload())
        with mock.patch("apps.authn.sms.requests.post", return_value=response):
            with self.assertLogs("apps.authn.sms", level="INFO") as logs:
                send_sms("22507080930", "Votre code COTICI est 9876. Il expire dans 5 minutes.")
        for line in logs.output:
            self.assertNotIn("9876", line)

    def test_no_otp_code_leaked_in_logs_on_failure(self):
        response = _mock_response(
            200,
            {
                "messages": [
                    {
                        "to": "2250758712792",
                        "status": {"groupName": "REJECTED"},
                        "messageId": "msg-err",
                    }
                ]
            },
        )
        with mock.patch("apps.authn.sms.requests.post", return_value=response):
            with self.assertLogs("apps.authn.sms", level="ERROR") as logs:
                with self.assertRaises(SmsError):
                    send_sms("22507080930", "Votre code COTICI est 4242. Il expire dans 5 minutes.")
        for line in logs.output:
            self.assertNotIn("4242", line)

    def test_rejected_status_raises_sms_error(self):
        response = _mock_response(
            200,
            {
                "messages": [
                    {"to": "2250758712792", "status": {"groupName": "REJECTED"}, "messageId": "x"}
                ]
            },
        )
        with mock.patch("apps.authn.sms.requests.post", return_value=response):
            with self.assertRaises(SmsError):
                send_sms("22507080930", "message")

    def test_empty_messages_raises_sms_error(self):
        response = _mock_response(200, {"messages": []})
        with mock.patch("apps.authn.sms.requests.post", return_value=response):
            with self.assertRaises(SmsError):
                send_sms("22507080930", "message")

    def test_http_error_status_raises_sms_error(self):
        response = _mock_response(401, {"message": "Unauthorized"})
        with mock.patch("apps.authn.sms.requests.post", return_value=response):
            with self.assertRaises(SmsError):
                send_sms("22507080930", "message")

    def test_network_error_raises_sms_error(self):
        import requests

        with mock.patch(
            "apps.authn.sms.requests.post", side_effect=requests.ConnectionError("boom")
        ):
            with self.assertRaises(SmsError):
                send_sms("22507080930", "message")

    def test_non_json_response_raises_sms_error(self):
        response = mock.Mock()
        response.status_code = 200
        response.json.side_effect = ValueError("not json")
        response.text = "<html>not json</html>"
        with mock.patch("apps.authn.sms.requests.post", return_value=response):
            with self.assertRaises(SmsError):
                send_sms("22507080930", "message")


class SendSmsCinetPayMissingConfigTests(TestCase):
    @override_settings(SMS_PROVIDER="cinetpay", CINETPAY_SMS_API_KEY="", CINETPAY_SMS_SENDER="")
    def test_missing_api_key_raises_sms_error_without_network_call(self):
        with mock.patch("apps.authn.sms.requests.post") as mocked_post:
            with self.assertRaises(SmsError):
                send_sms("22507080930", "message")
        mocked_post.assert_not_called()


class SendSmsUnknownProviderTests(TestCase):
    """Un provider inconnu/mal orthographié doit échouer bruyamment, jamais
    dégrader silencieusement vers 'console'."""

    @override_settings(SMS_PROVIDER="twilio")
    def test_unknown_provider_raises_sms_error(self):
        with mock.patch("apps.authn.sms.requests.post") as mocked_post:
            with self.assertRaises(SmsError):
                send_sms("22507080930", "message")
        mocked_post.assert_not_called()


@override_settings(
    SMS_PROVIDER="cinetpay",
    CINETPAY_SMS_API_KEY="test-api-key",
    CINETPAY_SMS_SENDER="COTICI",
)
class OtpEndpointSmsFailureTests(TestCase):
    """Si l'envoi SMS échoue, l'API doit répondre une erreur explicite plutôt
    que de laisser croire à l'utilisateur qu'un code lui a été envoyé, et ne
    doit pas laisser de OtpChallenge orphelin utilisable derrière elle."""

    def setUp(self):
        self.client = APIClient()
        # ScopedRateThrottle utilise le cache Django : le nettoyer évite que les
        # requêtes otp_request/otp_verify d'un test précédent ne fassent
        # basculer celui-ci en 429 (le throttle est partagé par processus,
        # pas remis à zéro automatiquement entre tests par Django).
        cache.clear()

    def test_request_otp_register_returns_503_and_does_not_create_challenge(self):
        with mock.patch("apps.authn.views.send_sms", side_effect=SmsError("boom")):
            response = self.client.post(
                "/api/auth/request-otp/",
                {"username": "22507080940", "password": "1234", "purpose": "register"},
                format="json",
            )

        self.assertEqual(response.status_code, 503)
        self.assertIn("detail", response.data)
        self.assertEqual(OtpChallenge.objects.count(), 0)

    def test_request_otp_login_returns_503_and_does_not_create_challenge(self):
        user = User.objects.create_user(
            username="22507080941", password="testpass123", numero_telephone="22507080941"
        )
        user.set_code_pin("1234")
        user.save()

        with mock.patch("apps.authn.views.send_sms", side_effect=SmsError("boom")):
            response = self.client.post(
                "/api/auth/request-otp/",
                {"username": "22507080941", "password": "testpass123", "purpose": "login"},
                format="json",
            )

        self.assertEqual(response.status_code, 503)
        self.assertEqual(OtpChallenge.objects.count(), 0)

    def test_resend_otp_failure_leaves_existing_challenge_untouched(self):
        user = User.objects.create_user(
            username="22507080942", password="testpass123", numero_telephone="22507080942"
        )
        user.set_code_pin("1234")
        user.save()

        with mock.patch("apps.authn.views.secrets.randbelow", return_value=1111):
            with mock.patch("apps.authn.views.send_sms", return_value=None):
                first = self.client.post(
                    "/api/auth/request-otp/",
                    {"username": "22507080942", "password": "testpass123", "purpose": "login"},
                    format="json",
                )
        self.assertEqual(first.status_code, 200)
        challenge_id = first.data["challenge_id"]
        original_hash = OtpChallenge.objects.get(id=challenge_id).code_hash

        with mock.patch("apps.authn.views.send_sms", side_effect=SmsError("boom")):
            resend = self.client.post(
                "/api/auth/resend-otp/", {"challenge_id": challenge_id}, format="json"
            )

        self.assertEqual(resend.status_code, 503)
        challenge = OtpChallenge.objects.get(id=challenge_id)
        self.assertEqual(challenge.code_hash, original_hash)
