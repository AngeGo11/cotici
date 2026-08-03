"""Serializers de consultation/résolution des litiges (`/api/admin/disputes/`)."""
from __future__ import annotations

from rest_framework import serializers

from apps.administration.services.dispute_admin_service import RESOLUTION_OUTCOMES
from apps.disputes.models import Dispute
from apps.administration.api.serializers.pii import MaskedPhoneField


class _UserSummarySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    username = serializers.CharField()
    numero_telephone_masque = MaskedPhoneField(source="numero_telephone")


class _TransactionSummarySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    ref_transaction = serializers.CharField()
    montant_transaction = serializers.DecimalField(max_digits=10, decimal_places=0)
    statut_transaction = serializers.CharField()


class _TontineSummarySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    description = serializers.CharField()
    etat = serializers.CharField()


class DisputeListSerializer(serializers.ModelSerializer):
    opened_by = _UserSummarySerializer(read_only=True, allow_null=True)
    resolved_by = _UserSummarySerializer(read_only=True, allow_null=True)
    transaction = _TransactionSummarySerializer(read_only=True, allow_null=True)
    tontine = _TontineSummarySerializer(read_only=True, allow_null=True)

    class Meta:
        model = Dispute
        fields = [
            "id",
            "opened_by",
            "transaction",
            "tontine",
            "category",
            "subject",
            "status",
            "opened_at",
            "resolved_at",
            "resolved_by",
        ]


class DisputeDetailSerializer(DisputeListSerializer):
    class Meta(DisputeListSerializer.Meta):
        fields = DisputeListSerializer.Meta.fields + ["description", "decision", "resolution_reason"]


class DisputeResolveSerializer(serializers.Serializer):
    """Corps attendu par `POST /api/admin/disputes/{id}/resolve/`.

    `resolution` porte le statut final (`resolu`/`rejete`), `decision` est le
    verdict motivé conservé sur le litige lui-même, et `reason` est le motif
    exigé pour toute action sensible (voir `AuditedActionMixin`). Les deux
    champs texte sont volontairement distincts : `decision` documente le
    dossier, `reason` justifie l'action pour l'audit — ils peuvent diverger
    (ex : motif interne plus détaillé que le verdict communiqué au client).
    """

    resolution = serializers.ChoiceField(choices=RESOLUTION_OUTCOMES)
    decision = serializers.CharField(allow_blank=False)
    reason = serializers.CharField(allow_blank=False, help_text="Motif obligatoire (action sensible).")
