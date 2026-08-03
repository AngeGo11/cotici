"""Gestion des comptes staff (création, désactivation, changement de rôle).

Règle non négociable : un membre du staff ne peut JAMAIS modifier son propre
profil staff (rôle, activation) via ce service — cela empêche un compte
compromis de s'auto-élever de privilèges ou de neutraliser une désactivation
légitime le concernant. Toute tentative lève `SelfModificationForbiddenError`.
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import transaction
from django.utils import timezone

from apps.administration.domain.errors import SelfModificationForbiddenError
from apps.administration.models import StaffProfile

User = get_user_model()


def _assert_not_self(actor, target_profile: StaffProfile) -> None:
    if actor.pk == target_profile.user_id:
        raise SelfModificationForbiddenError(
            "Un membre du staff ne peut pas modifier son propre profil staff."
        )


@transaction.atomic
def create_staff(
    *,
    created_by,
    username: str,
    numero_telephone: str,
    password: str,
    role: str,
    email: str = "",
    first_name: str = "",
    last_name: str = "",
) -> StaffProfile:
    """Crée un `User` + `StaffProfile` staff. Le mot de passe fourni doit être
    changé à la première connexion (`must_change_password=True`).

    N'active PAS le TOTP : il sera configuré au premier login
    (voir `services/auth_service.setup_totp`).
    """
    user = User(
        username=username,
        numero_telephone=numero_telephone,
        email=email,
        first_name=first_name,
        last_name=last_name,
    )
    user.set_password(password)
    # Distinct du `code_pin` client (4 chiffres) : le staff s'authentifie
    # avec un mot de passe classique, jamais le PIN client.
    user.is_staff = True
    user.save()

    profile = StaffProfile.objects.create(
        user=user,
        role=role,
        is_active=True,
        must_change_password=True,
        password_changed_at=timezone.now(),
        created_by=created_by,
    )
    return profile


@transaction.atomic
def change_role(*, actor, target_profile: StaffProfile, new_role: str) -> StaffProfile:
    _assert_not_self(actor, target_profile)
    target_profile = StaffProfile.objects.select_for_update().get(pk=target_profile.pk)
    target_profile.role = new_role
    target_profile.save(update_fields=["role", "updated_at"])
    return target_profile


@transaction.atomic
def deactivate_staff(*, actor, target_profile: StaffProfile) -> StaffProfile:
    _assert_not_self(actor, target_profile)
    target_profile = StaffProfile.objects.select_for_update().get(pk=target_profile.pk)
    target_profile.is_active = False
    target_profile.save(update_fields=["is_active", "updated_at"])
    return target_profile


@transaction.atomic
def reactivate_staff(*, actor, target_profile: StaffProfile) -> StaffProfile:
    _assert_not_self(actor, target_profile)
    target_profile = StaffProfile.objects.select_for_update().get(pk=target_profile.pk)
    target_profile.is_active = True
    target_profile.save(update_fields=["is_active", "updated_at"])
    return target_profile


@transaction.atomic
def reset_totp(*, actor, target_profile: StaffProfile) -> StaffProfile:
    """Révoque le secret TOTP : le staff devra ré-enrôler sa 2FA au prochain
    login. Tant que `totp_confirmed_at` est nul, l'accès admin est refusé
    (voir `permissions.IsStaffMember`)."""
    _assert_not_self(actor, target_profile)
    target_profile = StaffProfile.objects.select_for_update().get(pk=target_profile.pk)
    target_profile.totp_secret = ""
    target_profile.totp_confirmed_at = None
    target_profile.last_totp_counter = 0
    target_profile.save(
        update_fields=["totp_secret", "totp_confirmed_at", "last_totp_counter", "updated_at"]
    )
    return target_profile
