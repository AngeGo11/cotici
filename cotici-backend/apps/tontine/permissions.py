from rest_framework import permissions

from apps.tontine.models import Tontine, TontineMembre


def _tontine_from_obj(obj):
    if isinstance(obj, Tontine):
        return obj
    tontine = getattr(obj, "tontine", None)
    if isinstance(tontine, Tontine):
        return tontine
    return None


def user_is_tontine_admin(user, tontine) -> bool:
    """Hôte de la tontine ou membre avec rôle administrateur et statut actif."""
    if not user.is_authenticated or tontine is None:
        return False
    if getattr(tontine, "hote_id", None) == user.id:
        return True
    return TontineMembre.objects.filter(
        tontine=tontine,
        membre_id=user.id,
        role_membre=TontineMembre.ROLE_MEMBRE.ADMIN,
        statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
    ).exists()


class IsTontineAdmin(permissions.BasePermission):
    """Accès réservé à l’hôte de la tontine ou à un membre administrateur actif."""

    message = "Seuls les hôtes (créateur de tontines/administrateur) peuvent effectuer cette action."

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated)

    def has_object_permission(self, request, view, obj):
        tontine = _tontine_from_obj(obj)
        return user_is_tontine_admin(request.user, tontine)
