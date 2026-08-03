"""`/api/admin/tontines/` : consultation et modération des tontines de groupe.

Lecture réservée à `Perm.TONTINE_READ`, modération à `Perm.TONTINE_MODERATE`.
Périmètre strict : `type_tontine=GROUPE` (voir
`services/tontine_admin_service.py` pour le piège de l'héritage multi-table
avec `Cagnotte`/tontines solidaires).
"""
from __future__ import annotations

from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ReadOnlyModelViewSet

from apps.administration.api.serializers.tontines import (
    TontineDetailSerializer,
    TontineListSerializer,
    TontineModerateSerializer,
)
from apps.administration.authentication import AdminSessionAuthentication
from apps.administration.domain.audit_actions import TONTINE_MODERATED
from apps.administration.domain.roles import Perm
from apps.administration.mixins import AuditedActionMixin
from apps.administration.pagination import AdminPageNumberPagination
from apps.administration.permissions import HasStaffPermission, IsStaffMember, ReadOnlyForAuditor
from apps.administration.services import tontine_admin_service
from apps.administration.services.tontine_admin_service import InvalidModerationActionError
from apps.administration.throttling import AdminActionThrottle
from apps.tontine.models import Tontine


class TontineViewSet(AuditedActionMixin, ReadOnlyModelViewSet):
    """Lecture (liste + détail) et modération des tontines de groupe.

    `ReadOnlyModelViewSet` (et non `StaffScopedViewSet`/`ModelViewSet`) car ce
    module n'expose aucune écriture CRUD générique — la seule mutation
    possible est l'action `moderate`, dédiée."""

    queryset = Tontine.objects.none()  # surchargé par get_queryset()
    authentication_classes = [AdminSessionAuthentication]
    permission_classes = [IsStaffMember, ReadOnlyForAuditor, HasStaffPermission(Perm.TONTINE_READ)]
    throttle_classes = [AdminActionThrottle]
    throttle_scope = "admin_action"
    pagination_class = AdminPageNumberPagination
    audit_action = TONTINE_MODERATED

    def get_serializer_class(self):
        if self.action == "retrieve":
            return TontineDetailSerializer
        return TontineListSerializer

    def get_queryset(self):
        params = self.request.query_params
        return tontine_admin_service.list_tontines(
            search=params.get("search", ""),
            etat=params.get("etat", ""),
        )

    def retrieve(self, request, *args, **kwargs):
        tontine = self.get_object()
        context = tontine_admin_service.get_tontine_detail_context(tontine)
        tontine.regle = context["regle"]
        # `membres_liste` (et non `membres`) : `Tontine.membres` est déjà le
        # descripteur M2M généré par Django (through=TontineMembre), sur
        # lequel une affectation directe est interdite.
        tontine.membres_liste = context["membres"]
        tontine.tours = context["tours"]
        tontine.penalites_en_cours = context["penalites_en_cours"]
        serializer = self.get_serializer(tontine)
        return Response(serializer.data)

    def get_audit_action(self) -> str:
        return TONTINE_MODERATED

    @action(
        detail=True,
        methods=["post"],
        url_path="moderate",
        permission_classes=[IsStaffMember, ReadOnlyForAuditor, HasStaffPermission(Perm.TONTINE_MODERATE)],
    )
    def moderate(self, request, pk=None):
        # `self.get_object()` s'appuie sur `get_queryset()` (déjà filtré sur
        # `type_tontine=GROUPE`) et lève un 404 DRF standard si l'id cible une
        # Cagnotte/tontine solidaire (héritage multi-table) ou n'existe pas.
        tontine = self.get_object()
        serializer = TontineModerateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        moderate_action = serializer.validated_data["action"]
        reason = serializer.validated_data["reason"]

        self.enforce_reason_if_sensitive(TONTINE_MODERATED, reason)
        try:
            tontine, before, after = tontine_admin_service.moderate_tontine(
                actor=request.user, tontine=tontine, action=moderate_action, reason=reason
            )
        except InvalidModerationActionError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        self.record_audit(
            request,
            target_type="tontine",
            target_id=tontine.pk,
            target_user=tontine.hote,
            reason=reason,
            before=before,
            after=after,
        )
        return Response(TontineListSerializer(tontine).data, status=status.HTTP_200_OK)
