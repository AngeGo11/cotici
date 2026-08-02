"""Accès aux données `StaffProfile` / `StaffLoginAttempt`.

Isole les requêtes ORM du reste du code (services, vues) : toute évolution du
schéma de requêtage passe par ici.
"""
from __future__ import annotations

from django.conf import settings
from django.contrib.auth import get_user_model

from apps.administration.models import StaffLoginAttempt, StaffProfile

User = get_user_model()


def get_staff_profile_for_user(user) -> StaffProfile | None:
    return StaffProfile.objects.select_related("user").filter(user=user).first()


def get_user_by_identifier(identifier: str):
    """Résout un identifiant de connexion staff (username ou numéro de
    téléphone) vers un `User`, sans lever d'exception si introuvable."""
    identifier = (identifier or "").strip()
    if not identifier:
        return None
    return (
        User.objects.filter(username=identifier).first()
        or User.objects.filter(numero_telephone=identifier).first()
    )


def list_staff_profiles():
    return StaffProfile.objects.select_related("user", "created_by").order_by("-created_at")


def record_login_attempt(
    *,
    user,
    username_tried: str,
    ip_address: str | None,
    user_agent: str,
    stage: str,
    success: bool,
) -> StaffLoginAttempt:
    return StaffLoginAttempt.objects.create(
        user=user,
        username_tried=username_tried,
        ip_address=ip_address,
        user_agent=user_agent[:512] if user_agent else "",
        stage=stage,
        success=success,
    )
