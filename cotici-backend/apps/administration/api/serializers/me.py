"""Serializer du profil du membre du staff actuellement connecté (`/me/`).

N'expose JAMAIS `totp_secret` ni `last_totp_counter`.
"""
from __future__ import annotations

from rest_framework import serializers

from apps.administration.domain.roles import permissions_for_role
from apps.administration.models import StaffProfile


class AdminMeSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source="user.username", read_only=True)
    numero_telephone = serializers.CharField(source="user.numero_telephone", read_only=True)
    email = serializers.EmailField(source="user.email", read_only=True)
    first_name = serializers.CharField(source="user.first_name", read_only=True)
    last_name = serializers.CharField(source="user.last_name", read_only=True)
    totp_confirmed = serializers.SerializerMethodField()
    permissions = serializers.SerializerMethodField()

    class Meta:
        model = StaffProfile
        fields = [
            "username",
            "numero_telephone",
            "email",
            "first_name",
            "last_name",
            "role",
            "permissions",
            "is_active",
            "totp_confirmed",
            "last_login_ip",
            "must_change_password",
            "created_at",
        ]
        read_only_fields = fields

    def get_totp_confirmed(self, obj: StaffProfile) -> bool:
        return obj.totp_confirmed_at is not None

    def get_permissions(self, obj: StaffProfile) -> list:
        """Permissions effectives du rôle. Le front s'en sert UNIQUEMENT pour
        masquer la navigation : la vérification qui fait foi reste
        `HasStaffPermission` côté serveur."""
        return sorted(permissions_for_role(obj.role))
