"""Serializers du module utilisateurs finaux (`/api/admin/users/`).

Règle de base du module : **les données personnelles sortent masquées.**
Un opérateur support n'a pas besoin du numéro complet pour faire son travail
courant ; le numéro en clair s'obtient via `POST /users/{id}/reveal-pii/`,
qui exige la permission `user.pii_reveal`, un motif, et laisse une trace
nominative dans le journal d'audit. Aucun serializer de ce fichier ne doit
donc exposer `numero_telephone` ou `email` en clair.
"""
from __future__ import annotations

from decimal import Decimal

from rest_framework import serializers

# Les fonctions de masquage vivent dans `pii.py` : elles s'appliquent à tous
# les modules du back-office, pas seulement à celui-ci. Réexportées ici pour
# les appelants historiques.
from apps.administration.api.serializers.pii import mask_email, mask_phone

__all__ = [
    "mask_email",
    "mask_phone",
    "AdminUserListSerializer",
    "AdminUserDetailSerializer",
    "ReasonSerializer",
    "RevealedPiiSerializer",
]


class AdminUserListSerializer(serializers.Serializer):
    """Ligne de la liste des utilisateurs. PII masquée (voir docstring du
    module)."""

    id = serializers.IntegerField(read_only=True)
    username = serializers.CharField(read_only=True)
    first_name = serializers.CharField(read_only=True)
    last_name = serializers.CharField(read_only=True)
    numero_telephone_masque = serializers.SerializerMethodField()
    email_masque = serializers.SerializerMethodField()
    is_active = serializers.BooleanField(read_only=True)
    date_joined = serializers.DateTimeField(read_only=True)
    last_login = serializers.DateTimeField(read_only=True)
    solde_courant = serializers.SerializerMethodField()
    tontines_count = serializers.IntegerField(read_only=True, default=0)

    def get_numero_telephone_masque(self, obj) -> str:
        return mask_phone(obj.numero_telephone)

    def get_email_masque(self, obj) -> str:
        return mask_email(obj.email)

    def get_solde_courant(self, obj) -> Decimal:
        # `wallet` vient d'un select_related : un utilisateur n'ayant jamais
        # ouvert de portefeuille n'en a pas, d'où le repli à 0.
        wallet = getattr(obj, "wallet", None)
        return wallet.solde_courant if wallet else Decimal(0)


class AdminUserDetailSerializer(AdminUserListSerializer):
    """Fiche utilisateur. Ajoute les compteurs produits ; toujours sans PII
    en clair."""

    tontines_hebergees = serializers.IntegerField(read_only=True, default=0)
    epargnes_count = serializers.IntegerField(read_only=True, default=0)
    transactions_count = serializers.IntegerField(read_only=True, default=0)
    a_un_portefeuille = serializers.SerializerMethodField()

    def get_a_un_portefeuille(self, obj) -> bool:
        return getattr(obj, "wallet", None) is not None


class ReasonSerializer(serializers.Serializer):
    """Corps commun des actions sensibles du module."""

    reason = serializers.CharField(
        allow_blank=False,
        help_text="Motif obligatoire (action sensible, journalisée).",
    )


class RevealedPiiSerializer(serializers.Serializer):
    """Réponse de `reveal-pii` : les seules données en clair du module."""

    numero_telephone = serializers.CharField(read_only=True)
    email = serializers.CharField(read_only=True)
    first_name = serializers.CharField(read_only=True)
    last_name = serializers.CharField(read_only=True)
