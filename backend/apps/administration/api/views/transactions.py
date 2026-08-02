"""`/api/admin/transactions/` : consultation des transactions wallet et
forçage exceptionnel de leur statut.

Réservé au staff disposant de `Perm.TX_READ` (lecture) ; le forçage de statut
exige en plus `Perm.TX_FORCE_STATUS` (action sensible, motif obligatoire —
voir `AuditedActionMixin` et `services/transaction_admin_service.py` pour la
justification détaillée de la restriction des transitions autorisées).
"""
from __future__ import annotations

from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import MethodNotAllowed, ValidationError
from rest_framework.response import Response

from apps.administration.api.filters import parse_transaction_filters
from apps.administration.api.serializers.transactions import (
    AdminTransactionDetailSerializer,
    AdminTransactionListSerializer,
    TransactionForceStatusSerializer,
)
from apps.administration.domain.audit_actions import TRANSACTION_FORCED_STATUS
from apps.administration.domain.errors import InvalidTransactionTransitionError
from apps.administration.domain.roles import Perm
from apps.administration.mixins import StaffScopedViewSet
from apps.administration.permissions import HasStaffPermission
from apps.administration.services import transaction_admin_service
from apps.wallet.models import Transaction


class TransactionAdminViewSet(StaffScopedViewSet):
    """Consultation (`list`/`retrieve`) et forçage exceptionnel de statut
    (`force_status`) des transactions wallet.

    Ce viewset ne permet JAMAIS la création, la modification libre ni la
    suppression d'une transaction : `create`/`update`/`partial_update`/
    `destroy` sont explicitement désactivées (défense en profondeur, en plus
    de `http_method_names`). La seule mutation possible depuis le back-office
    est `force_status`, volontairement restreinte à un jeu de transitions
    défendables.
    """

    queryset = Transaction.objects.none()  # surchargé par get_queryset()
    permission_classes = StaffScopedViewSet.permission_classes + [HasStaffPermission(Perm.TX_READ)]
    http_method_names = ["get", "post", "head", "options"]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return AdminTransactionDetailSerializer
        return AdminTransactionListSerializer

    def get_queryset(self):
        # Les filtres de requête (statut, type, mode, dates, recherche) ne
        # s'appliquent qu'à la liste : les appliquer aussi sur `retrieve`/
        # `force_status` ferait dépendre l'accès à UNE transaction précise de
        # paramètres de requête non pertinents pour une action détail.
        if self.action == "list":
            filters = parse_transaction_filters(self.request.query_params)
            return transaction_admin_service.list_transactions(**filters)
        return transaction_admin_service.base_queryset()

    def get_audit_action(self) -> str:
        return {"force_status": TRANSACTION_FORCED_STATUS}.get(getattr(self, "action", ""), "")

    # --- Écritures génériques explicitement désactivées -------------------

    def create(self, request, *args, **kwargs):
        raise MethodNotAllowed("POST")

    def update(self, request, *args, **kwargs):
        raise MethodNotAllowed(request.method)

    def partial_update(self, request, *args, **kwargs):
        raise MethodNotAllowed(request.method)

    def destroy(self, request, *args, **kwargs):
        raise MethodNotAllowed("DELETE")

    @action(
        detail=True,
        methods=["post"],
        url_path="force-status",
        # Remplace intentionnellement les permissions de classe : le forçage
        # de statut exige `Perm.TX_FORCE_STATUS` en plus de l'appartenance
        # staff active, indépendamment de `Perm.TX_READ`.
        permission_classes=StaffScopedViewSet.permission_classes
        + [HasStaffPermission(Perm.TX_FORCE_STATUS)],
    )
    def force_status(self, request, pk=None):
        """Force le statut d'une transaction `EN ATTENTE` vers `RÉUSSIE`,
        `ÉCHOUÉE` ou `ANNULÉE`.

        LIMITE VOLONTAIRE : cette action ne recalcule NI ne corrige le solde
        du wallet associé — ce serait un ajustement de solde, qui relève du
        module portefeuilles (`Perm.WALLET_ADJUST`). Un opérateur qui force
        une transaction à `RÉUSSIE` doit, si nécessaire, ouvrir en complément
        un ajustement de solde explicite et motivé.
        """
        transaction_obj = self.get_object()
        serializer = TransactionForceStatusSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data["reason"]
        new_status = serializer.validated_data["new_status"]

        # Contrôle AVANT toute mutation métier : une action sensible sans
        # motif ne doit jamais atteindre le service.
        self.enforce_reason_if_sensitive(TRANSACTION_FORCED_STATUS, reason)

        before = {"statut_transaction": transaction_obj.statut_transaction}
        try:
            transaction_obj = transaction_admin_service.force_status(
                transaction_id=transaction_obj.pk,
                new_status=new_status,
            )
        except InvalidTransactionTransitionError as exc:
            raise ValidationError({"new_status": str(exc)}) from exc

        self.record_audit(
            request,
            target_type="transaction",
            target_id=transaction_obj.pk,
            target_user=transaction_obj.wallet.user,
            reason=reason,
            before=before,
            after={"statut_transaction": transaction_obj.statut_transaction},
        )
        return Response(
            AdminTransactionDetailSerializer(transaction_obj).data, status=status.HTTP_200_OK
        )
