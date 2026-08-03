"""Gestion des utilisateurs finaux depuis le back-office.

Deux principes structurent ce module :

1. **Une suspension doit couper l'accès pour de bon.** Passer `is_active` à
   False bloque les nouvelles authentifications, mais un refresh token JWT
   déjà émis continuerait de fonctionner : la suspension révoque donc aussi
   tous les tokens "outstanding" du compte (même mécanique que la
   réinitialisation de PIN dans `apps.authn.views`).

2. **Les comptes staff ne se pilotent pas ici.** `/api/admin/users/` est le
   périmètre client ; suspendre un compte back-office passe par
   `/api/admin/staff/` (qui, lui, interdit l'auto-modification). Sans cette
   frontière, un opérateur pourrait désactiver un collègue — voire
   lui-même — en contournant les garde-fous de `staff_service`.
"""
from __future__ import annotations

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Count, Q
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken

from apps.administration.domain.errors import SelfModificationForbiddenError
from apps.tontine.models import Tontine

User = get_user_model()


class StaffAccountNotManageableError(Exception):
    """Levée lorsqu'une action "utilisateur final" cible un compte staff."""


def list_users():
    """Queryset de base des utilisateurs clients, enrichi des compteurs
    affichés en liste (pour éviter une requête par ligne).

    Les comptes porteurs d'un `StaffProfile` sont exclus : ce ne sont pas des
    clients de la plateforme et ils relèvent de `/api/admin/staff/`.
    """
    return (
        User.objects.filter(staff_profile__isnull=True)
        .select_related("wallet")
        .annotate(
            tontines_count=Count(
                "tontines_membres",
                filter=Q(tontines_membres__etat=Tontine.ETAT.ACTIF),
                distinct=True,
            ),
        )
        .order_by("-date_joined")
    )


def get_user(user_id) -> User:
    return list_users().get(pk=user_id)


def _assert_manageable(actor, target: User) -> None:
    if getattr(target, "staff_profile", None) is not None:
        raise StaffAccountNotManageableError(
            "Ce compte est un compte staff : utilisez /api/admin/staff/."
        )
    if actor is not None and actor.pk == target.pk:
        raise SelfModificationForbiddenError(
            "Un opérateur ne peut pas se suspendre lui-même."
        )


def revoke_refresh_tokens(user: User) -> int:
    """Blackliste tous les refresh tokens encore valides de `user`.

    Retourne le nombre de tokens révoqués (utile pour le journal d'audit :
    "combien de sessions ont été coupées"). Les access tokens déjà émis
    restent valides jusqu'à leur expiration naturelle (quelques minutes).
    """
    outstanding_ids = list(
        OutstandingToken.objects.filter(user=user).values_list("id", flat=True)
    )
    BlacklistedToken.objects.bulk_create(
        (BlacklistedToken(token_id=token_id) for token_id in outstanding_ids),
        ignore_conflicts=True,
    )
    return len(outstanding_ids)


@transaction.atomic
def suspend_user(*, actor, target: User) -> User:
    """Désactive le compte et coupe les sessions JWT en cours."""
    _assert_manageable(actor, target)
    target.is_active = False
    target.save(update_fields=["is_active"])
    revoke_refresh_tokens(target)
    return target


@transaction.atomic
def reactivate_user(*, actor, target: User) -> User:
    """Réactive un compte suspendu.

    Ne restaure aucun token : l'utilisateur devra se reconnecter, ce qui est
    l'effet recherché (les tokens révoqués l'ont été pour une raison).
    """
    _assert_manageable(actor, target)
    target.is_active = True
    target.save(update_fields=["is_active"])
    return target


def reveal_pii(target: User) -> dict:
    """Retourne les données personnelles en clair d'un utilisateur.

    Aucune vérification de permission ici : c'est la vue qui exige
    `Perm.USER_PII_REVEAL` **et** un motif, et qui journalise l'accès. Ce
    service reste volontairement passif pour que l'unique point d'entrée
    audité soit la vue.
    """
    return {
        "numero_telephone": target.numero_telephone,
        "email": target.email,
        "first_name": target.first_name,
        "last_name": target.last_name,
    }
