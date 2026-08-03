"""Tests d'inscription, connexion, cycle de vie JWT et permissions pour
apps.authn.

Priorités sécurité couvertes :
- inscription : doublon numero_telephone, mot de passe faible, champs
  manquants ;
- connexion : mauvais identifiants, compte inactif, messages d'erreur
  identiques (pas d'énumération de comptes) ;
- JWT : token expiré, malformé, altéré, refresh valide/invalide ;
- endpoints protégés : rejet strict des requêtes non authentifiées, un
  utilisateur ne peut voir que ses propres données via `/me/`.
"""
from datetime import timedelta
from unittest import mock

from django.contrib.auth import get_user_model
from django.core.cache import cache
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from rest_framework_simplejwt.tokens import AccessToken, RefreshToken

from apps.authn.models import OtpChallenge

User = get_user_model()

REGISTER_URL = "/api/auth/register/"
LOGIN_URL = "/api/auth/login/"
REFRESH_URL = "/api/auth/refresh/"
ME_URL = "/api/auth/me/"
REQUEST_OTP_URL = "/api/auth/request-otp/"
VERIFY_OTP_URL = "/api/auth/verify-otp/"


class RegisterEndpointTests(TestCase):
    def setUp(self):
        self.client = APIClient()

    def _valid_payload(self, **overrides):
        payload = {
            "numero_telephone": "22507080950",
            "password": "Xk7#mQ2z!pLw",
            "code_pin": "1234",
        }
        payload.update(overrides)
        return payload

    def test_register_success_creates_user_and_wallet(self):
        response = self.client.post(REGISTER_URL, self._valid_payload(), format="json")
        self.assertEqual(response.status_code, 201, response.data)
        self.assertTrue(User.objects.filter(numero_telephone="22507080950").exists())
        self.assertIn("solde", response.data["user"])

    def test_register_rejects_duplicate_phone_number(self):
        User.objects.create_user(
            username="22507080951", password="whatever123", numero_telephone="22507080951"
        )
        response = self.client.post(
            REGISTER_URL, self._valid_payload(numero_telephone="22507080951"), format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("numero_telephone", response.data)

    def test_register_rejects_duplicate_username(self):
        User.objects.create_user(
            username="dup_username", password="whatever123", numero_telephone="22507080952"
        )
        response = self.client.post(
            REGISTER_URL,
            self._valid_payload(username="dup_username", numero_telephone="22507080953"),
            format="json",
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("username", response.data)

    def test_register_rejects_weak_password(self):
        response = self.client.post(
            REGISTER_URL, self._valid_payload(password="1234"), format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("password", response.data)
        self.assertFalse(User.objects.filter(numero_telephone="22507080950").exists())

    def test_register_rejects_common_password(self):
        response = self.client.post(
            REGISTER_URL, self._valid_payload(password="password"), format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("password", response.data)

    def test_register_rejects_missing_password(self):
        payload = self._valid_payload()
        del payload["password"]
        response = self.client.post(REGISTER_URL, payload, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("password", response.data)

    def test_register_rejects_missing_code_pin(self):
        payload = self._valid_payload()
        del payload["code_pin"]
        response = self.client.post(REGISTER_URL, payload, format="json")
        self.assertEqual(response.status_code, 400)
        self.assertIn("code_pin", response.data)

    def test_register_rejects_non_numeric_code_pin(self):
        response = self.client.post(
            REGISTER_URL, self._valid_payload(code_pin="abcd"), format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("code_pin", response.data)

    def test_register_rejects_short_code_pin(self):
        response = self.client.post(
            REGISTER_URL, self._valid_payload(code_pin="12"), format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("code_pin", response.data)

    def test_register_rejects_invalid_phone_length(self):
        response = self.client.post(
            REGISTER_URL, self._valid_payload(numero_telephone="123"), format="json"
        )
        self.assertEqual(response.status_code, 400)
        self.assertIn("numero_telephone", response.data)

    def test_register_without_phone_requires_username(self):
        payload = self._valid_payload()
        del payload["numero_telephone"]
        response = self.client.post(REGISTER_URL, payload, format="json")
        self.assertEqual(response.status_code, 400)

    def test_register_does_not_store_plaintext_password_or_pin(self):
        response = self.client.post(REGISTER_URL, self._valid_payload(), format="json")
        self.assertEqual(response.status_code, 201, response.data)
        user = User.objects.get(numero_telephone="22507080950")
        self.assertNotEqual(user.password, "Xk7#mQ2z!pLw")
        self.assertNotEqual(user.code_pin, "1234")
        self.assertTrue(user.check_password("Xk7#mQ2z!pLw"))
        self.assertTrue(user.check_code_pin("1234"))


class LoginEnumerationTests(TestCase):
    """L'endpoint /login/ (TokenObtainPairView) ne doit JAMAIS révéler si un
    numéro/identifiant existe : message d'erreur identique pour un compte
    inexistant, un mauvais mot de passe, ou un compte désactivé."""

    def setUp(self):
        # ScopedRateThrottle stocke ses compteurs dans le cache par défaut
        # (LocMemCache), qui n'est PAS réinitialisé entre TestCase (contrairement
        # à la base de données, remise à zéro via une transaction par test).
        # Sans ce clear(), l'ordre d'exécution des tests fait que ce test
        # peut hériter d'un throttle déjà partiellement consommé par une
        # autre classe de test du même module.
        cache.clear()
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="22507080960", password="CorrectHorse42!", numero_telephone="22507080960"
        )
        self.user.set_code_pin("1234")
        self.user.save()

    def test_unknown_username_returns_401(self):
        response = self.client.post(
            LOGIN_URL, {"username": "00000000000", "password": "whatever"}, format="json"
        )
        self.assertEqual(response.status_code, 401)

    def test_wrong_password_for_existing_user_returns_401(self):
        response = self.client.post(
            LOGIN_URL, {"username": "22507080960", "password": "wrongpass"}, format="json"
        )
        self.assertEqual(response.status_code, 401)

    def test_error_message_identical_whether_account_exists_or_not(self):
        unknown_response = self.client.post(
            LOGIN_URL, {"username": "99999999999", "password": "whatever"}, format="json"
        )
        wrong_password_response = self.client.post(
            LOGIN_URL, {"username": "22507080960", "password": "wrongpass"}, format="json"
        )
        self.assertEqual(unknown_response.status_code, wrong_password_response.status_code)
        self.assertEqual(unknown_response.data, wrong_password_response.data)

    def test_inactive_account_cannot_login_even_with_correct_password(self):
        self.user.is_active = False
        self.user.save()
        response = self.client.post(
            LOGIN_URL,
            {"username": "22507080960", "password": "CorrectHorse42!"},
            format="json",
        )
        self.assertEqual(response.status_code, 401)

    def test_valid_credentials_login_succeeds(self):
        response = self.client.post(
            LOGIN_URL,
            {"username": "22507080960", "password": "CorrectHorse42!"},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)
        self.assertIn("refresh", response.data)


class RequestOtpLoginEnumerationTests(TestCase):
    """Même exigence de non-énumération pour le flux OTP (request-otp,
    purpose=login) : le message d'erreur ne doit pas varier."""

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="22507080961", password="testpass123", numero_telephone="22507080961"
        )
        self.user.set_code_pin("1234")
        self.user.save()

    def test_unknown_user_and_wrong_pin_return_identical_error(self):
        unknown = self.client.post(
            REQUEST_OTP_URL,
            {"username": "00000000099", "password": "9999", "purpose": "login"},
            format="json",
        )
        wrong_pin = self.client.post(
            REQUEST_OTP_URL,
            {"username": "22507080961", "password": "9999", "purpose": "login"},
            format="json",
        )
        self.assertEqual(unknown.status_code, 401)
        self.assertEqual(wrong_pin.status_code, 401)
        self.assertEqual(unknown.data, wrong_pin.data)

    def test_inactive_account_rejected(self):
        self.user.is_active = False
        self.user.save()
        with mock.patch("apps.authn.views._send_otp_sms"):
            response = self.client.post(
                REQUEST_OTP_URL,
                {"username": "22507080961", "password": "1234", "purpose": "login"},
                format="json",
            )
        self.assertEqual(response.status_code, 401)


class RegisterOtpEnumerationTests(TestCase):
    """request-otp(purpose=register) ne doit JAMAIS révéler, via son statut
    ou le contenu de sa réponse, qu'un numéro est déjà associé à un compte
    (fermeture de l'énumération de comptes). Voir apps/authn/tests/
    test_register_enumeration.py pour la couverture complète (réponses
    strictement identiques, SMS envoyé au propriétaire réel, etc.)."""

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        User.objects.create_user(
            username="22507080962", password="testpass123", numero_telephone="22507080962"
        )

    def test_existing_phone_returns_200_generic(self):
        with mock.patch("apps.authn.views.send_sms"):
            response = self.client.post(
                REQUEST_OTP_URL,
                {"username": "22507080962", "password": "1234", "purpose": "register"},
                format="json",
            )
        self.assertEqual(response.status_code, 200)

    def test_new_phone_returns_200_and_sends_otp(self):
        with mock.patch("apps.authn.views.send_sms"):
            response = self.client.post(
                REQUEST_OTP_URL,
                {"username": "22507080963", "password": "1234", "purpose": "register"},
                format="json",
            )
        self.assertEqual(response.status_code, 200)


class MeEndpointAuthTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="22507080970", password="testpass123", numero_telephone="22507080970"
        )
        self.other_user = User.objects.create_user(
            username="22507080971", password="testpass123", numero_telephone="22507080971"
        )

    def test_unauthenticated_request_is_rejected(self):
        response = self.client.get(ME_URL)
        self.assertEqual(response.status_code, 401)

    def test_authenticated_request_returns_own_data_only(self):
        token = RefreshToken.for_user(self.user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        response = self.client.get(ME_URL)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["numero_telephone"], "22507080970")
        self.assertNotEqual(response.data["numero_telephone"], self.other_user.numero_telephone)

    def test_malformed_bearer_token_is_rejected(self):
        self.client.credentials(HTTP_AUTHORIZATION="Bearer not.a.valid.jwt")
        response = self.client.get(ME_URL)
        self.assertEqual(response.status_code, 401)

    def test_missing_bearer_prefix_is_rejected(self):
        token = RefreshToken.for_user(self.user).access_token
        self.client.credentials(HTTP_AUTHORIZATION=str(token))
        response = self.client.get(ME_URL)
        self.assertEqual(response.status_code, 401)


class JwtLifecycleTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="22507080980", password="testpass123", numero_telephone="22507080980"
        )

    def test_expired_access_token_is_rejected(self):
        token = AccessToken.for_user(self.user)
        token.set_exp(lifetime=timedelta(seconds=-10))  # déjà expiré
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        response = self.client.get(ME_URL)
        self.assertEqual(response.status_code, 401)

    def test_tampered_access_token_is_rejected(self):
        token = str(AccessToken.for_user(self.user))
        # Altère un caractère du payload (partie centrale du JWT) pour
        # invalider la signature.
        parts = token.split(".")
        payload = list(parts[1])
        payload[-1] = "A" if payload[-1] != "A" else "B"
        parts[1] = "".join(payload)
        tampered = ".".join(parts)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {tampered}")
        response = self.client.get(ME_URL)
        self.assertEqual(response.status_code, 401)

    def test_token_for_deleted_user_is_rejected(self):
        token = AccessToken.for_user(self.user)
        self.user.delete()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        response = self.client.get(ME_URL)
        self.assertEqual(response.status_code, 401)

    def test_token_for_inactive_user_is_rejected(self):
        token = AccessToken.for_user(self.user)
        self.user.is_active = False
        self.user.save()
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {token}")
        response = self.client.get(ME_URL)
        self.assertEqual(response.status_code, 401)

    def test_refresh_token_returns_new_access_token(self):
        refresh = RefreshToken.for_user(self.user)
        response = self.client.post(REFRESH_URL, {"refresh": str(refresh)}, format="json")
        self.assertEqual(response.status_code, 200)
        self.assertIn("access", response.data)

        new_access = response.data["access"]
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {new_access}")
        me_response = self.client.get(ME_URL)
        self.assertEqual(me_response.status_code, 200)

    def test_invalid_refresh_token_is_rejected(self):
        response = self.client.post(REFRESH_URL, {"refresh": "garbage.token.value"}, format="json")
        self.assertEqual(response.status_code, 401)

    def test_expired_refresh_token_is_rejected(self):
        refresh = RefreshToken.for_user(self.user)
        refresh.set_exp(lifetime=timedelta(seconds=-10))
        response = self.client.post(REFRESH_URL, {"refresh": str(refresh)}, format="json")
        self.assertEqual(response.status_code, 401)

    def test_access_token_cannot_be_used_as_refresh_token(self):
        access = AccessToken.for_user(self.user)
        response = self.client.post(REFRESH_URL, {"refresh": str(access)}, format="json")
        self.assertEqual(response.status_code, 401)


class OtpVerifyBruteForceTests(TestCase):
    """Vérifie le verrouillage après OTP_MAX_ATTEMPTS tentatives invalides."""

    def setUp(self):
        cache.clear()
        self.client = APIClient()
        self.user = User.objects.create_user(
            username="22507080990", password="testpass123", numero_telephone="22507080990"
        )
        self.challenge = OtpChallenge.objects.create(
            user=self.user,
            purpose=OtpChallenge.PURPOSE_LOGIN,
            code_hash="deadbeef" * 8,
            expires_at=timezone.now() + timedelta(minutes=5),
        )

    def test_locks_out_after_max_attempts(self):
        for _ in range(5):
            response = self.client.post(
                VERIFY_OTP_URL,
                {"challenge_id": str(self.challenge.id), "otp": "0000"},
                format="json",
            )
            self.assertEqual(response.status_code, 400)

        locked_response = self.client.post(
            VERIFY_OTP_URL,
            {"challenge_id": str(self.challenge.id), "otp": "0000"},
            format="json",
        )
        self.assertEqual(locked_response.status_code, 429)

    def test_expired_challenge_is_rejected(self):
        self.challenge.expires_at = timezone.now() - timedelta(seconds=1)
        self.challenge.save()
        response = self.client.post(
            VERIFY_OTP_URL,
            {"challenge_id": str(self.challenge.id), "otp": "0000"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_already_used_challenge_is_rejected(self):
        self.challenge.is_used = True
        self.challenge.save()
        response = self.client.post(
            VERIFY_OTP_URL,
            {"challenge_id": str(self.challenge.id), "otp": "0000"},
            format="json",
        )
        self.assertEqual(response.status_code, 400)

    def test_unknown_challenge_id_returns_404(self):
        response = self.client.post(
            VERIFY_OTP_URL,
            {"challenge_id": "00000000-0000-0000-0000-000000000000", "otp": "0000"},
            format="json",
        )
        self.assertEqual(response.status_code, 404)


class DoubleRegistrationRaceTests(TestCase):
    """Double-soumission : deux inscriptions concurrentes avec le même
    numéro ne doivent jamais aboutir à deux comptes (contrainte unique en
    base, en plus de la validation applicative)."""

    def test_duplicate_phone_is_rejected_at_db_level_even_bypassing_serializer(self):
        from apps.authn.models import User as AuthUser
        from django.db import IntegrityError, transaction

        AuthUser.objects.create_user(
            username="racephone", password="testpass123", numero_telephone="22507080999"
        )
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                AuthUser.objects.create_user(
                    username="racephone2", password="testpass123", numero_telephone="22507080999"
                )
