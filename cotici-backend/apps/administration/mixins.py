"""Mixins communs aux vues du back-office administrateur."""
from __future__ import annotations

from rest_framework.exceptions import ValidationError
from rest_framework.viewsets import ModelViewSet

from apps.administration.authentication import AdminSessionAuthentication
from apps.administration.domain.audit_actions import is_sensitive
from apps.administration.pagination import AdminPageNumberPagination
from apps.administration.permissions import IsStaffMember, ReadOnlyForAuditor
from apps.administration.throttling import AdminActionThrottle


class AuditedActionMixin:
    """Enrichit `request.admin_audit` (posé par `AdminAuditTrailMiddleware`)
    avec le détail métier d'une action (before/after/reason/target...).

    Refuse (400) toute action jugée "sensible"
    (`domain.audit_actions.is_sensitive`) qui ne fournit pas de motif
    (`reason`) non vide dans le corps de la requête : une action sensible
    doit toujours être justifiée.
    """

    #: À définir par la vue concrète (ou déterminé dynamiquement via
    #: `get_audit_action`).
    audit_action: str = ""

    def get_audit_action(self) -> str:
        return self.audit_action

    def enforce_reason_if_sensitive(self, action: str, reason: str) -> None:
        """À appeler AVANT toute mutation métier pour les actions
        sensibles : lève 400 si `reason` est vide, empêchant l'exécution de
        l'action plutôt que de la valider a posteriori (l'écriture en base
        ne doit jamais précéder ce contrôle)."""
        if is_sensitive(action) and not (reason or "").strip():
            raise ValidationError(
                {"reason": "Un motif (reason) est obligatoire pour cette action sensible."}
            )

    def record_audit(
        self,
        request,
        *,
        target_type: str = "",
        target_id: str = "",
        target_user=None,
        reason: str = "",
        before=None,
        after=None,
    ) -> None:
        action = self.get_audit_action()
        if is_sensitive(action) and not (reason or "").strip():
            raise ValidationError(
                {"reason": "Un motif (reason) est obligatoire pour cette action sensible."}
            )

        audit_payload = getattr(request, "admin_audit", None)
        if audit_payload is None:
            # La requête n'est pas passée par AdminAuditTrailMiddleware (ex :
            # méthode GET/HEAD, qui n'est pas auditée par défaut) : rien à
            # enrichir.
            return

        audit_payload.update(
            {
                "action": action,
                "target_type": target_type,
                "target_id": str(target_id) if target_id else "",
                "target_user": target_user,
                "reason": reason,
                "before": before,
                "after": after,
            }
        )


class StaffScopedViewSet(AuditedActionMixin, ModelViewSet):
    """Base commune des ViewSets du back-office : authentification session
    dédiée, appartenance staff obligatoire, lecture seule pour l'auditeur,
    pagination et throttling par défaut."""

    authentication_classes = [AdminSessionAuthentication]
    permission_classes = [IsStaffMember, ReadOnlyForAuditor]
    throttle_classes = [AdminActionThrottle]
    throttle_scope = "admin_action"
    pagination_class = AdminPageNumberPagination
