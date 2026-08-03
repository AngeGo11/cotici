"""Serializers du flux d'authentification back-office."""
from __future__ import annotations

from rest_framework import serializers


class AdminLoginSerializer(serializers.Serializer):
    identifiant = serializers.CharField(
        max_length=150, help_text="Nom d'utilisateur ou numéro de téléphone du membre du staff."
    )
    password = serializers.CharField(write_only=True, trim_whitespace=False)


class AdminTotpVerifySerializer(serializers.Serializer):
    code = serializers.RegexField(regex=r"^\d{6}$", help_text="Code TOTP à 6 chiffres.")


class AdminLogoutSerializer(serializers.Serializer):
    everywhere = serializers.BooleanField(
        default=False,
        help_text="Si vrai, termine TOUTES les sessions actives de ce compte (pas seulement la session courante).",
    )
