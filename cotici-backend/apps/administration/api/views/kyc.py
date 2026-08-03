"""`/api/admin/kyc/` : file d'examen des dossiers de vérification d'identité.

Séparation des droits :

- `kyc.review`  : consulter la file, ouvrir un dossier, consulter ses pièces
                  et le prendre en examen ;
- `kyc.approve` : prononcer une décision (approbation ou rejet).

Consulter n'est donc jamais décider. La consultation d'une pièce est
elle-même une action tracée : c'est le seul moyen de démontrer, plus tard,
qui a vu la pièce d'identité d'un client et pourquoi.
"""
from __future__ import annotations

from django.http import FileResponse, Http404
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.viewsets import ReadOnlyModelViewSet

from apps.administration.api.serializers.kyc import (
    KycApproveSerializer,
    KycRejectSerializer,
    KycSubmissionDetailSerializer,
    KycSubmissionListSerializer,
)
from apps.administration.authentication import AdminSessionAuthentication
from apps.administration.domain.audit_actions import KYC_APPROVED, KYC_REJECTED
from apps.administration.domain.roles import Perm
from apps.administration.mixins import AuditedActionMixin
from apps.administration.pagination import AdminPageNumberPagination
from apps.administration.permissions import (
    HasStaffPermission,
    IsStaffMember,
    ReadOnlyForAuditor,
)
from apps.administration.services import kyc_admin_service
from apps.administration.services.kyc_admin_service import DecisionDejaPriseError
from apps.administration.throttling import AdminActionThrottle

#: Pièces consultables et champ correspondant sur le modèle. Liste blanche :
#: le nom de la pièce vient de l'URL, il ne doit jamais servir de `getattr`
#: libre sur l'instance.
DOCUMENT_FIELDS = {
    "recto": "document_recto",
    "verso": "document_verso",
    "selfie": "selfie",
}


class KycViewSet(AuditedActionMixin, ReadOnlyModelViewSet):
    authentication_classes = [AdminSessionAuthentication]
    permission_classes = [
        IsStaffMember,
        ReadOnlyForAuditor,
        HasStaffPermission(Perm.KYC_REVIEW),
    ]
    throttle_classes = [AdminActionThrottle]
    throttle_scope = "admin_action"
    pagination_class = AdminPageNumberPagination
    serializer_class = KycSubmissionListSerializer

    def get_queryset(self):
        return kyc_admin_service.list_submissions(
            statut=(self.request.query_params.get("statut") or "").strip(),
            niveau=(self.request.query_params.get("niveau") or "").strip(),
            search=(self.request.query_params.get("search") or "").strip(),
        )

    def get_serializer_class(self):
        if self.action in ("retrieve", "approve", "reject", "take_in_review"):
            return KycSubmissionDetailSerializer
        return KycSubmissionListSerializer

    def get_audit_action(self) -> str:
        return {"approve": KYC_APPROVED, "reject": KYC_REJECTED}.get(
            getattr(self, "action", ""), ""
        )

    @action(
        detail=True,
        methods=["post"],
        url_path="approve",
        permission_classes=[
            IsStaffMember,
            ReadOnlyForAuditor,
            HasStaffPermission(Perm.KYC_APPROVE),
        ],
    )
    def approve(self, request, pk=None):
        submission = self.get_object()
        serializer = KycApproveSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data["reason"]
        self.enforce_reason_if_sensitive(KYC_APPROVED, reason)

        before = {"statut": submission.statut}
        try:
            submission = kyc_admin_service.approve(
                submission=submission,
                decide_par=request.user,
                niveau=serializer.validated_data.get("niveau") or "",
                motif=reason,
            )
        except DecisionDejaPriseError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)

        self.record_audit(
            request,
            target_type="kyc_submission",
            target_id=submission.pk,
            target_user=submission.user,
            reason=reason,
            before=before,
            after={
                "statut": submission.statut,
                "niveau_accorde": submission.niveau_accorde,
            },
        )
        return Response(KycSubmissionDetailSerializer(submission).data)

    @action(
        detail=True,
        methods=["post"],
        url_path="reject",
        permission_classes=[
            IsStaffMember,
            ReadOnlyForAuditor,
            HasStaffPermission(Perm.KYC_APPROVE),
        ],
    )
    def reject(self, request, pk=None):
        submission = self.get_object()
        serializer = KycRejectSerializer(data=request.data or {})
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data["reason"]
        self.enforce_reason_if_sensitive(KYC_REJECTED, reason)

        before = {"statut": submission.statut}
        try:
            submission = kyc_admin_service.reject(
                submission=submission, decide_par=request.user, motif=reason
            )
        except DecisionDejaPriseError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_409_CONFLICT)

        self.record_audit(
            request,
            target_type="kyc_submission",
            target_id=submission.pk,
            target_user=submission.user,
            reason=reason,
            before=before,
            after={"statut": submission.statut},
        )
        return Response(KycSubmissionDetailSerializer(submission).data)

    @action(detail=True, methods=["post"], url_path="take-in-review")
    def take_in_review(self, request, pk=None):
        """Signale que le dossier est pris en charge.

        Ni sensible ni décisionnel : c'est un signal de coordination entre
        opérateurs, il n'exige donc pas de motif.
        """
        submission = kyc_admin_service.take_in_review(submission=self.get_object())
        return Response(KycSubmissionDetailSerializer(submission).data)

    @action(detail=True, methods=["get"], url_path=r"document/(?P<piece>[a-z]+)")
    def document(self, request, pk=None, piece=None):
        """Sert une pièce justificative en flux authentifié.

        Les fichiers vivent hors de tout répertoire servi par le serveur web :
        cet endpoint est la seule voie de lecture, et il exige la même session
        staff que le reste du back-office.

        Limite assumée : étant un GET, cette consultation n'est pas captée par
        `AdminAuditTrailMiddleware` (qui n'instrumente que les écritures). Elle
        est donc journalisée explicitement ci-dessous, sans motif — exiger un
        motif à chaque ouverture d'image rendrait l'examen impraticable, alors
        que la décision qui suit, elle, est motivée.
        """
        submission = self.get_object()
        field_name = DOCUMENT_FIELDS.get(piece or "")
        if field_name is None:
            raise Http404("Pièce inconnue.")

        fichier = getattr(submission, field_name)
        if not fichier:
            raise Http404("Pièce non fournie pour ce dossier.")

        from apps.audits.models import AdminActionLog

        AdminActionLog.objects.create(
            actor=request.user,
            actor_role=getattr(request.user.staff_profile, "role", ""),
            action="kyc_document_viewed",
            target_type="kyc_submission",
            target_id=str(submission.pk),
            target_user=submission.user,
            after={"piece": piece},
            ip_address=request.META.get("REMOTE_ADDR"),
            path=request.path,
            http_method=request.method,
            status_code=200,
        )

        # `as_attachment=False` : la pièce est affichée dans l'écran d'examen,
        # pas téléchargée sur le poste de l'opérateur.
        return FileResponse(fichier.open("rb"), as_attachment=False)
