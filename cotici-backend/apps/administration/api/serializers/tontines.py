"""Serializers de consultation/modération des tontines de groupe
(`/api/admin/tontines/`)."""
from __future__ import annotations

from rest_framework import serializers

from apps.administration.services.tontine_admin_service import ModerationAction
from apps.tontine.models import Penalite, Tontine, TontineMembre, TontineRegle, TourTontine
from apps.administration.api.serializers.pii import MaskedPhoneField


class _HoteSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    username = serializers.CharField()
    numero_telephone_masque = MaskedPhoneField(source="numero_telephone")


class TontineListSerializer(serializers.ModelSerializer):
    hote = _HoteSerializer(read_only=True)
    membres_count = serializers.IntegerField(read_only=True)
    tours_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Tontine
        fields = [
            "id",
            "hote",
            "description",
            "type_tontine",
            "etat",
            "est_active",
            "date_creation",
            "date_archivage",
            "date_suppression",
            "membres_count",
            "tours_count",
        ]


class TontineRegleSerializer(serializers.ModelSerializer):
    class Meta:
        model = TontineRegle
        fields = [
            "objectif_cotisation",
            "montant_cotisation",
            "montant_penalite",
            "nombre_max",
            "ordre_ramassage",
            "frequence",
            "frequence_personalise",
            "nombre_tours",
            "delai_grace_heures",
            "penalites_automatiques",
        ]


class TontineMembreSerializer(serializers.ModelSerializer):
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
            "ordre_ramassage",
            "regles_acceptees",
        ]


class TourTontineSerializer(serializers.ModelSerializer):
    beneficiaire_id = serializers.IntegerField(source="user.id", read_only=True)
    beneficiaire_username = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = TourTontine
        fields = [
            "id",
            "beneficiaire_id",
            "beneficiaire_username",
            "montant_depose",
            "date",
            "numero_du_tour",
            "statut_tour",
            "date_echeance",
        ]


class PenaliteEnCoursSerializer(serializers.ModelSerializer):
    user_id = serializers.IntegerField(source="user.id", read_only=True)
    user_username = serializers.CharField(source="user.username", read_only=True)

    class Meta:
        model = Penalite
        fields = [
            "id",
            "user_id",
            "user_username",
            "montant_penalite",
            "montant_due",
            "type_penalite",
            "date_attribution_penalite",
        ]


class TontineDetailSerializer(TontineListSerializer):
    regle = TontineRegleSerializer(read_only=True)
    membres = TontineMembreSerializer(many=True, read_only=True, source="membres_liste")
    tours = TourTontineSerializer(many=True, read_only=True)
    penalites_en_cours = PenaliteEnCoursSerializer(many=True, read_only=True)

    class Meta(TontineListSerializer.Meta):
        fields = TontineListSerializer.Meta.fields + [
            "qr_code",
            "regle",
            "membres",
            "tours",
            "penalites_en_cours",
        ]


class TontineModerateSerializer(serializers.Serializer):
    action = serializers.ChoiceField(choices=ModerationAction.ALL)
    reason = serializers.CharField(allow_blank=False, help_text="Motif obligatoire (action sensible).")
