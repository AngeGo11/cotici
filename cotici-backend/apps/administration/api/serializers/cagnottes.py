"""Serializers de consultation/modération des cagnottes
(`/api/admin/cagnottes/`)."""
from __future__ import annotations

from rest_framework import serializers

from apps.administration.services.cagnotte_admin_service import (
    ModerationAction,
    progression_percent,
)
from apps.cagnotte.models import Cagnotte
from apps.tontine.models import TontineMembre
from apps.administration.api.serializers.pii import MaskedPhoneField


class _OrganisateurSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    username = serializers.CharField()
    numero_telephone_masque = MaskedPhoneField(source="numero_telephone")
    first_name = serializers.CharField()
    last_name = serializers.CharField()


class CagnotteListSerializer(serializers.ModelSerializer):
    organisateur = _OrganisateurSerializer(source="hote", read_only=True)
    # Annotations posées par `cagnotte_admin_service.list_cagnottes` : jamais
    # recalculées en Python ligne par ligne (voir `annotate`/`Sum` côté
    # service — piège documenté sur `CONTRIBUTION_CAGNOTTE`).
    montant_collecte = serializers.DecimalField(max_digits=12, decimal_places=0, read_only=True)
    membres_count = serializers.IntegerField(read_only=True)
    progression = serializers.SerializerMethodField()

    class Meta:
        model = Cagnotte
        fields = [
            "id",
            "nom_cagnotte",
            "organisateur",
            "objectif_cotisation",
            "montant_collecte",
            "progression",
            "objectif_atteint",
            "recuperation_effectue",
            "etat",
            "est_active",
            "date_creation",
            "date_archivage",
            "date_suppression",
            "membres_count",
        ]

    def get_progression(self, obj) -> float:
        return progression_percent(obj.montant_collecte, obj.objectif_cotisation)


class _CagnotteMembreSerializer(serializers.ModelSerializer):
    membre_id = serializers.IntegerField(source="membre.id", read_only=True)
    membre_username = serializers.CharField(source="membre.username", read_only=True)
    membre_numero_telephone_masque = MaskedPhoneField(source="membre.numero_telephone")

    class Meta:
        model = TontineMembre
        fields = [
            "id",
            "membre_id",
            "membre_username",
            "membre_numero_telephone_masque",
            "role_membre",
            "statut_membre",
            "date_adhesion",
        ]


class CagnotteDetailSerializer(CagnotteListSerializer):
    membres = _CagnotteMembreSerializer(many=True, read_only=True, source="membres_liste")

    class Meta(CagnotteListSerializer.Meta):
        fields = CagnotteListSerializer.Meta.fields + [
            "description",
            "qr_code",
            "membres",
        ]


class CagnotteModerateSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=ModerationAction.ALL)
    reason = serializers.CharField(allow_blank=False, help_text="Motif obligatoire (action sensible).")
