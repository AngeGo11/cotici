"""Serializers de consultation des tontines solidaires
(`/api/admin/solidarity/`)."""
from __future__ import annotations

from rest_framework import serializers

from apps.administration.services.solidarity_admin_service import mask_phone_number
from apps.solidarity.models import Solidarity
from apps.administration.api.serializers.pii import MaskedPhoneField


class _HoteSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    username = serializers.CharField()
    numero_telephone_masque = MaskedPhoneField(source="numero_telephone")


class SolidaritySerializer(serializers.ModelSerializer):
    """Sérialiseur unique de liste/détail (pas d'agrégat supplémentaire au
    détail, contrairement aux tontines de groupe) : le contrat d'API ne
    prévoit que `GET /` et `GET /{id}/`.
    """

    hote = _HoteSerializer(read_only=True)
    montant_collecte = serializers.DecimalField(max_digits=10, decimal_places=0, read_only=True)
    montant_verse = serializers.DecimalField(max_digits=10, decimal_places=0, read_only=True)
    beneficiaire_telephone_masque = serializers.SerializerMethodField()
    progression_pct = serializers.SerializerMethodField()

    class Meta:
        model = Solidarity
        fields = [
            "id",
            "hote",
            "description",
            "beneficiaire_telephone_masque",
            "objectif_cotisation",
            "montant_collecte",
            "progression_pct",
            "objectif_atteint",
            "versement_effectue",
            "montant_verse",
            "etat",
            "est_active",
            "date_creation",
            "date_archivage",
            "date_suppression",
        ]

    def get_beneficiaire_telephone_masque(self, obj: Solidarity) -> str:
        # Ne JAMAIS exposer `beneficiaire_telephone` en clair (PII d'un tiers
        # étranger à la session staff) : voir docstring de
        # `mask_phone_number`.
        return mask_phone_number(obj.beneficiaire_telephone)

    def get_progression_pct(self, obj: Solidarity) -> float:
        objectif = obj.objectif_cotisation or 0
        if not objectif:
            return 0.0
        collecte = getattr(obj, "montant_collecte", None) or 0
        return round(min(float(collecte) / float(objectif), 1.0) * 100, 2)
