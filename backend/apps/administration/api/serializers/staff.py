"""Serializers de gestion des comptes staff (`/api/admin/staff/`)."""
from __future__ import annotations

from rest_framework import serializers

from apps.administration.domain.roles import StaffRole, permissions_for_role
from apps.administration.models import StaffProfile


class StaffProfileSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    numero_telephone = serializers.CharField(source="user.numero_telephone", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    first_name = serializers.CharField(source="user.first_name", read_only=True)
    last_name = serializers.CharField(source="user.last_name", read_only=True)
    last_login = serializers.DateTimeField(source="user.last_login", read_only=True)
    date_joined = serializers.DateTimeField(source="user.date_joined", read_only=True)
    created_by_username = serializers.CharField(source="created_by.username", read_only=True, default="")
    permissions = serializers.SerializerMethodField()
    totp_enabled = serializers.SerializerMethodField()

    class Meta:
        model = StaffProfile
        fields = [
            "id",
            "username",
            "first_name",
            "last_name",
            "numero_telephone",
            "email",
            "role",
            "permissions",
            "is_active",
            "totp_enabled",
            "must_change_password",
            "last_login_ip",
            "last_login",
            "date_joined",
            "created_by_username",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [f for f in fields if f not in ("role", "is_active")]

    def get_permissions(self, obj) -> list[str]:
        """Permissions effectives du rôle, dérivées de la matrice Python.

        Dérivées et non stockées : la matrice de `domain/roles.py` est
        l'unique source de vérité, et un champ persisté finirait par diverger
        d'elle au premier changement de périmètre d'un rôle.
        """
        return sorted(permissions_for_role(obj.role))

    def get_totp_enabled(self, obj) -> bool:
        """Vrai une fois l'enrôlement 2FA terminé.

        Expose l'état de l'enrôlement, jamais `totp_secret` : ce secret ne
        doit apparaître dans aucun serializer (voir la docstring du modèle).
        """
        return obj.totp_confirmed_at is not None


class StaffCreateSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    numero_telephone = serializers.CharField(max_length=15)
    password = serializers.CharField(write_only=True, min_length=10, trim_whitespace=False)
    role = serializers.ChoiceField(choices=StaffRole.choices)
    email = serializers.EmailField(required=False, allow_blank=True, default="")
    first_name = serializers.CharField(required=False, allow_blank=True, default="")
    last_name = serializers.CharField(required=False, allow_blank=True, default="")


class StaffRoleUpdateSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=StaffRole.choices)
    reason = serializers.CharField(allow_blank=False, help_text="Motif obligatoire (action sensible).")
