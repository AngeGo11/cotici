"""Permissions DRF du back-office administrateur."""
from __future__ import annotations

from django.conf import settings
from rest_framework.permissions import SAFE_METHODS, BasePermission

from apps.administration.domain.roles import StaffRole, has_perm


def _get_active_staff_profile(user):
    """Retourne le `StaffProfile` de `user` s'il existe, est actif, et a
    complété l'enrôlement TOTP — sinon None.

    L'exigence d'enrôlement tombe lorsque `ADMIN_TOTP_REQUIRED` est à `False`
    (développement uniquement) : sans elle, aucune session ne pourrait être
    ouverte puisque `totp_confirmed_at` resterait nul indéfiniment.
    """
    profile = getattr(user, "staff_profile", None)
    if profile is None:
        return None
    if not profile.is_active:
        return None
    totp_required = bool(getattr(settings, "ADMIN_TOTP_REQUIRED", True))
    if totp_required and profile.totp_confirmed_at is None:
        return None
    return profile


class IsStaffMember(BasePermission):
    """Autorise uniquement un `User` actif possédant un `StaffProfile` actif
    et ayant terminé l'enrôlement TOTP (`totp_confirmed_at` non nul).

    C'est la permission de base de TOUTES les vues `/api/admin/` (hors
    endpoints d'authentification pré-session : csrf/login/totp).
    """

    message = "Accès réservé aux membres du staff avec un profil actif et TOTP confirmé."

    def has_permission(self, request, view) -> bool:
        user = request.user
        if not user or not user.is_authenticated or not user.is_active:
            return False
        return _get_active_staff_profile(user) is not None


class HasStaffPermission(BasePermission):
    """Factory de permission DRF vérifiant qu'un membre du staff détient un
    code de permission donné (`apps.administration.domain.roles.Perm`).

    Usage : `permission_classes = [IsStaffMember, HasStaffPermission(Perm.STAFF_MANAGE)]`
    """

    def __new__(cls, perm: str):
        class _HasStaffPermission(BasePermission):
            message = f"Permission manquante : {perm}."

            def has_permission(self, request, view) -> bool:
                profile = _get_active_staff_profile(request.user)
                if profile is None:
                    return False
                return has_perm(profile.role, perm)

        _HasStaffPermission.__name__ = f"HasStaffPermission[{perm}]"
        return _HasStaffPermission


class ReadOnlyForAuditor(BasePermission):
    """Bloque toute méthode d'écriture pour le rôle `auditeur`, même si une
    permission a été (par erreur) accordée par ailleurs : filet de sécurité
    supplémentaire cohérent avec la règle métier "auditeur = lecture seule".
    """

    message = "Le rôle auditeur est strictement en lecture seule."

    def has_permission(self, request, view) -> bool:
        if request.method in SAFE_METHODS:
            return True
        profile = _get_active_staff_profile(request.user)
        if profile is None:
            # Laisse une autre permission (IsStaffMember) refuser l'accès.
            return True
        return profile.role != StaffRole.AUDITEUR
