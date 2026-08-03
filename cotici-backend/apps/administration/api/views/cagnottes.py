"""`/api/admin/cagnottes/` : consultation et modération des cagnottes.

Lecture réservée à `Perm.CAGNOTTE_READ`, modération à `Perm.CAGNOTTE_MODERATE`
(action sensible : motif obligatoire, voir `AuditedActionMixin`). Périmètre
strict : `Cagnotte.objects` (voir `services/cagnotte_admin_service.py` pour
le piège de l'héritage multi-table avec les tontines de groupe/solidaires).
"""
from __future__ import annotations

from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ReadOnlyModelViewSet

from apps.administration.api.serializers.cagnottes import (
    CagnotteDetailSerializer,
    CagnotteListSerializer,
    CagnotteModerateSerializer,
)
from apps.administration.authentication import AdminSessionAuthentication
from apps.administration.domain.audit_actions import CAGNOTTE_MODERATED
from apps.administration.domain.roles import Perm
from apps.administration.mixins import AuditedActionMixin
from apps.administration.pagination import AdminPageNumberPagination
from apps.administration.permissions import HasStaffPermission, IsStaffMember, ReadOnlyForAuditor
from apps.administration.services import cagnotte_admin_service
from apps.administration.services.cagnotte_admin_service import InvalidModerationActionError
from apps.administration.throttling import AdminActionThrottle
from apps.cagnotte.models import Cagnotte


def _parse_objectif_atteint(raw: str | None) -> bool | None:
    """Parse le filtre booléen `objectif_atteint` de la querystring
    (`"true"`/`"false"`) ; `None` (filtre non appliqué) pour toute autre
    valeur, y compris absente."""
    if raw is None:
        return None
    lowered = raw.strip().lower()
    if lowered in ("true", "1"):
        return True
    if lowered in ("false", "0"):
        return False
    return None


class CagnotteViewSet(AuditedActionMixin, ReadOnlyModelViewSet):
    """Lecture (liste + détail) et modération des cagnottes.

    `ReadOnlyModelViewSet` (et non `ModelViewSet`) : ce module n'expose aucune
    écriture CRUD générique — la seule mutation possible est l'action
    `moderate`, dédiée et motivée."""

    queryset = Cagnotte.objects.none()  # surchargé par get_queryset()
    authentication_classes = [AdminSessionAuthentication]
    permission_classes = [IsStaffMember, ReadOnlyForAuditor, HasStaffPermission(Perm.CAGNOTTE_READ)]
    throttle_classes = [AdminActionThrottle]
    throttle_scope = "admin_action"
    pagination_class = AdminPageNumberPagination
    audit_action = CAGNOTTE_MODERATED

    def get_serializer_class(self):
        if self.action == "retrieve":
            return CagnotteDetailSerializer
        return CagnotteListSerializer

    def get_queryset(self):
        params = self.request.query_params
        return cagnotte_admin_service.list_cagnottes(
            search=params.get("search", ""),
            etat=params.get("etat", ""),
            objectif_atteint=_parse_objectif_atteint(params.get("objectif_atteint")),
        )

    def retrieve(self, request, *args, **kwargs):
        cagnotte = self.get_object()
        context = cagnotte_admin_service.get_cagnotte_detail_context(cagnotte)
        # `membres_liste` (et non `membres`) : `Tontine.membres` est déjà le
        # descripteur M2M généré par Django (through=TontineMembre), sur
        # lequel une affectation directe est interdite.
        cagnotte.membres_liste = context["membres"]
        serializer = self.get_serializer(cagnotte)
        return Response(serializer.data)

    def get_audit_action(self) -> str:
        return CAGNOTTE_MODERATED

    @action(
        detail=True,
        methods=["post"],
        url_path="moderate",
        permission_classes=[IsStaffMember, ReadOnlyForAuditor, HasStaffPermission(Perm.CAGNOTTE_MODERATE)],
    )
    def moderate(self, request, pk=None):
        # `self.get_object()` s'appuie sur `get_queryset()` (déjà restreint à
        # `Cagnotte.objects`) et lève un 404 DRF standard si l'id cible une
        # tontine de groupe/solidaire (héritage multi-table) ou n'existe pas.
        cagnotte = self.get_object()
        serializer = CagnotteModerateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        moderate_action = serializer.validated_data["action"]
        reason = serializer.validated_data["reason"]

        self.enforce_reason_if_sensitive(CAGNOTTE_MODERATED, reason)
        try:
            cagnotte, before, after = cagnotte_admin_service.moderate_cagnotte(
                actor=request.user, cagnotte=cagnotte, action=moderate_action, reason=reason
            )
        except InvalidModerationActionError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        self.record_audit(
            request,
            target_type="cagnotte",
            target_id=cagnotte.pk,
            target_user=cagnotte.hote,
            reason=reason,
            before=before,
            after=after,
        )
        # Ré-annote le montant collecté / le nombre de membres pour la
        # réponse : `moderate_cagnotte` renvoie l'instance verrouillée
        # (`select_for_update`), qui ne porte pas les annotations de liste.
        cagnotte = cagnotte_admin_service.list_cagnottes().get(pk=cagnotte.pk)
        return Response(CagnotteListSerializer(cagnotte).data, status=status.HTTP_200_OK)
