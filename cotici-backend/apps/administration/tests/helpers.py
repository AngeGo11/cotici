"""Utilitaires communs aux tests du back-office administrateur."""
from __future__ import annotations

import pyotp
from rest_framework.test import APIClient

from apps.administration.domain.roles import StaffRole
from apps.administration.services import staff_service


def create_staff_profile(*, username: str, numero_telephone: str, password: str, role: str = StaffRole.SUPER_ADMIN):
    return staff_service.create_staff(
        created_by=None,
        username=username,
        numero_telephone=numero_telephone,
        password=password,
        role=role,
    )


def login_staff_client(client: APIClient, *, username: str, password: str) -> dict:
    """Exécute le flux complet (login -> totp/setup -> totp/verify) et laisse
    `client` avec une session administrateur active. Retourne la réponse de
    `/totp/verify/` (profil sérialisé)."""
    resp = client.post(
        "/api/admin/auth/login/", {"identifiant": username, "password": password}, format="json"
    )
    assert resp.status_code == 200, resp.content

    setup_resp = client.post("/api/admin/auth/totp/setup/", {}, format="json")
    assert setup_resp.status_code == 200, setup_resp.content
    secret = setup_resp.data["secret"]

    code = pyotp.TOTP(secret).now()
    verify_resp = client.post("/api/admin/auth/totp/verify/", {"code": code}, format="json")
    assert verify_resp.status_code == 200, verify_resp.content
    return verify_resp.data
