"""Vérifie le flux complet d'authentification back-office : login (mot de
passe) -> setup TOTP -> vérification TOTP -> session active -> logout, ainsi
que les garde-fous (mauvais code, rejeu, mauvais mot de passe).
"""
import pyotp
from django.core.cache import cache
from django.test import TestCase, override_settings
from rest_framework.test import APIClient

from apps.administration.domain.roles import StaffRole
from apps.administration.models import StaffLoginAttempt
from apps.administration.tests.helpers import create_staff_profile, login_staff_client


@override_settings(ADMIN_IP_ALLOWLIST="", DEBUG=True, ADMIN_TOTP_REQUIRED=True)
class AdminAuthFlowTests(TestCase):
    def setUp(self):
        # Le throttle `admin_login` est basé sur un cache partagé entre tests
        # (même IP de test client) : on le vide pour ne pas cumuler les
        # tentatives d'un test à l'autre.
        cache.clear()
        self.client = APIClient()
        self.password = "Un-Mot-De-Passe-Fort-1"
        self.profile = create_staff_profile(
            username="staff.super",
            numero_telephone="2250700000001",
            password=self.password,
            role=StaffRole.SUPER_ADMIN,
        )

    def test_login_with_wrong_password_is_rejected_and_logged(self):
        resp = self.client.post(
            "/api/admin/auth/login/",
            {"identifiant": "staff.super", "password": "mauvais-mot-de-passe"},
            format="json",
        )
        self.assertEqual(resp.status_code, 401)
        self.assertTrue(
            StaffLoginAttempt.objects.filter(
                username_tried="staff.super", stage=StaffLoginAttempt.Stage.PASSWORD, success=False
            ).exists()
        )

    def test_full_login_flow_establishes_session(self):
        payload = login_staff_client(self.client, username="staff.super", password=self.password)
        self.assertEqual(payload["username"], "staff.super")
        self.assertTrue(payload["totp_confirmed"])

        self.profile.refresh_from_db()
        self.assertIsNotNone(self.profile.totp_confirmed_at)

        me_resp = self.client.get("/api/admin/me/")
        self.assertEqual(me_resp.status_code, 200)
        self.assertEqual(me_resp.data["username"], "staff.super")

    def test_totp_verify_rejects_wrong_code(self):
        self.client.post(
            "/api/admin/auth/login/",
            {"identifiant": "staff.super", "password": self.password},
            format="json",
        )
        self.client.post("/api/admin/auth/totp/setup/", {}, format="json")
        resp = self.client.post("/api/admin/auth/totp/verify/", {"code": "000000"}, format="json")
        self.assertEqual(resp.status_code, 401)

    def test_totp_code_cannot_be_replayed(self):
        # Premier login complet : confirme le TOTP avec un premier code.
        login_staff_client(self.client, username="staff.super", password=self.password)

        # Nouvelle tentative de connexion (nouvel état de pré-authentification),
        # en réutilisant le MÊME code TOTP que la première fois : doit échouer
        # (anti-rejeu, indépendamment de la fenêtre de validité mathématique).
        self.profile.refresh_from_db()
        secret = self.profile.totp_secret
        reused_code = pyotp.TOTP(secret).now()

        self.client.post(
            "/api/admin/auth/login/",
            {"identifiant": "staff.super", "password": self.password},
            format="json",
        )
        resp = self.client.post("/api/admin/auth/totp/verify/", {"code": reused_code}, format="json")
        self.assertEqual(resp.status_code, 401)

    def test_logout_terminates_session(self):
        login_staff_client(self.client, username="staff.super", password=self.password)
        logout_resp = self.client.post("/api/admin/auth/logout/", {}, format="json")
        self.assertEqual(logout_resp.status_code, 200)

        me_resp = self.client.get("/api/admin/me/")
        self.assertEqual(me_resp.status_code, 403)

    def test_inactive_staff_profile_cannot_login(self):
        self.profile.is_active = False
        self.profile.save(update_fields=["is_active"])
        resp = self.client.post(
            "/api/admin/auth/login/",
            {"identifiant": "staff.super", "password": self.password},
            format="json",
        )
        self.assertEqual(resp.status_code, 401)
