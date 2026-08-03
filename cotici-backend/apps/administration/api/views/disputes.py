"""`/api/admin/disputes/` : consultation et résolution des litiges.

Lecture réservée à `Perm.DISPUTE_READ`, résolution à `Perm.DISPUTE_RESOLVE`.
Modèle exact suivi : `api/views/tontines.py` (lecture seule + une action
dédiée de transition d'état, plutôt qu'un CRUD générique — un litige ne se
crée/modifie pas depuis ce module, il ne fait que se résoudre).
"""
from __future__ import annotations

from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ReadOnlyModelViewSet

from apps.administration.api.serializers.disputes import (
    DisputeDetailSerializer,
    DisputeListSerializer,
    DisputeResolveSerializer,
)
from apps.administration.authentication import AdminSessionAuthentication
from apps.administration.domain.audit_actions import DISPUTE_RESOLVED
from apps.administration.domain.roles import Perm
from apps.administration.mixins import AuditedActionMixin
from apps.administration.pagination import AdminPageNumberPagination
from apps.administration.permissions import HasStaffPermission, IsStaffMember, ReadOnlyForAuditor
from apps.administration.services import dispute_admin_service
from apps.administration.services.dispute_admin_service import (
    InvalidDisputeTransitionError,
    InvalidResolutionOutcomeError,
)
from apps.administration.throttling import AdminActionThrottle
from apps.disputes.models import Dispute


class DisputeViewSet(AuditedActionMixin, ReadOnlyModelViewSet):
    """Lecture (liste + détail) et résolution des litiges.

    `ReadOnlyModelViewSet` : la seule mutation exposée est l'action
    `resolve`, dédiée (pas de CRUD générique — un litige n'est jamais créé ni
    modifié en tant que tel depuis le back-office, seulement tranché)."""

    queryset = Dispute.objects.none()  # surchargé par get_queryset()
    authentication_classes = [AdminSessionAuthentication]
    permission_classes = [IsStaffMember, ReadOnlyForAuditor, HasStaffPermission(Perm.DISPUTE_READ)]
    throttle_classes = [AdminActionThrottle]
    throttle_scope = "admin_action"
    pagination_class = AdminPageNumberPagination
    audit_action = DISPUTE_RESOLVED

    def get_serializer_class(self):
        if self.action == "retrieve":
            return DisputeDetailSerializer
        return DisputeListSerializer

    def get_queryset(self):
        params = self.request.query_params
        return dispute_admin_service.list_disputes(
            search=params.get("search", ""),
            status=params.get("status", ""),
            category=params.get("category", ""),
        )

    def get_audit_action(self) -> str:
        return DISPUTE_RESOLVED

    @action(
        detail=True,
        methods=["post"],
        url_path="resolve",
        permission_classes=[IsStaffMember, ReadOnlyForAuditor, HasStaffPermission(Perm.DISPUTE_RESOLVE)],
    )
    def resolve(self, request, pk=None):
        # `get_object_or_404` (et non l'appel direct au service) : convertit
        # `Dispute.DoesNotExist` en 404 DRF plutôt qu'en 500 non géré.
        dispute = get_object_or_404(dispute_admin_service.list_disputes(), pk=pk)
        serializer = DisputeResolveSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        resolution = serializer.validated_data["resolution"]
        decision = serializer.validated_data["decision"]
        reason = serializer.validated_data["reason"]

        self.enforce_reason_if_sensitive(DISPUTE_RESOLVED, reason)
        try:
            dispute, before, after = dispute_admin_service.resolve_dispute(
                actor=request.user,
                dispute=dispute,
                resolution=resolution,
                decision=decision,
                reason=reason,
            )
        except (InvalidDisputeTransitionError, InvalidResolutionOutcomeError) as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        self.record_audit(
            request,
            target_type="dispute",
            target_id=dispute.pk,
            target_user=dispute.opened_by,
            reason=reason,
            before=before,
            after=after,
        )
        return Response(DisputeDetailSerializer(dispute).data, status=status.HTTP_200_OK)
