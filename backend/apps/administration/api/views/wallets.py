"""`/api/admin/wallets/` : consultation et ajustement manuel des portefeuilles.

Lecture (`list`/`retrieve`) réservée à `Perm.WALLET_READ` ; l'action
`adjust` exige en plus `Perm.WALLET_ADJUST`. `adjust` est une action
sensible (`WALLET_ADJUSTED` ∈ `SENSITIVE_ACTIONS`) : un motif (`reason`) est
obligatoire, à la fois validé par le serializer et recontrôlé par
`AuditedActionMixin.enforce_reason_if_sensitive` avant toute mutation.
"""
from __future__ import annotations

from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.administration.api.serializers.wallets import (
    WalletAdjustSerializer,
    WalletDetailSerializer,
    WalletListSerializer,
)
from apps.administration.domain.audit_actions import WALLET_ADJUSTED
from apps.administration.domain.errors import WalletInsufficientBalanceError
from apps.administration.domain.roles import Perm
from apps.administration.mixins import StaffScopedViewSet
from apps.administration.permissions import HasStaffPermission
from apps.administration.services import wallet_admin_service
from apps.wallet.models import Wallet


class WalletViewSet(StaffScopedViewSet):
    """Consultation (`list`, `retrieve`) et ajustement (`adjust`) des
    `Wallet`. Aucune création/suppression depuis le back-office : un wallet
    est créé par l'application métier (à l'inscription), jamais par un
    membre du staff.
    """

    queryset = Wallet.objects.none()  # surchargé par get_queryset()
    serializer_class = WalletListSerializer
    http_method_names = ["get", "post", "head", "options"]

    def get_permissions(self):
        # Base commune (auth + lecture) à toutes les actions du ViewSet ;
        # `adjust` ajoute l'exigence de la permission d'écriture dédiée.
        permission_classes = list(StaffScopedViewSet.permission_classes) + [
            HasStaffPermission(Perm.WALLET_READ)
        ]
        if getattr(self, "action", None) == "adjust":
            permission_classes = permission_classes + [HasStaffPermission(Perm.WALLET_ADJUST)]
        return [perm() for perm in permission_classes]

    def get_queryset(self):
        params = self.request.query_params
        return wallet_admin_service.list_wallets_queryset(
            search=params.get("search", ""),
            ordering=params.get("ordering", ""),
        )

    def get_serializer_class(self):
        if self.action == "retrieve":
            return WalletDetailSerializer
        return WalletListSerializer

    def get_audit_action(self) -> str:
        return {"adjust": WALLET_ADJUSTED}.get(getattr(self, "action", ""), "")

    @action(detail=True, methods=["post"], url_path="adjust")
    def adjust(self, request, pk=None):
        """Ajuste manuellement le solde du wallet ciblé (crédit si `amount`
        positif, débit si négatif). Refuse (400) tout ajustement qui
        rendrait le solde négatif, ainsi que toute requête sans motif."""
        wallet = self.get_object()
        serializer = WalletAdjustSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        reason = serializer.validated_data["reason"]
        amount = serializer.validated_data["amount"]

        # Recontrôle explicite (défense en profondeur) : la validation du
        # serializer suffit déjà, mais on garde le même garde-fou que le
        # reste du module avant toute mutation métier.
        self.enforce_reason_if_sensitive(WALLET_ADJUSTED, reason)

        try:
            result = wallet_admin_service.adjust_balance(
                wallet_id=wallet.pk, amount=amount, reason=reason
            )
        except WalletInsufficientBalanceError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except Wallet.DoesNotExist:
            return Response(
                {"detail": "Portefeuille introuvable."}, status=status.HTTP_404_NOT_FOUND
            )

        self.record_audit(
            request,
            target_type="wallet",
            target_id=result["wallet"].pk,
            target_user=result["wallet"].user,
            reason=reason,
            before={"solde_courant": str(result["before"])},
            after={
                "solde_courant": str(result["after"]),
                "ref_transaction": result["transaction"].ref_transaction,
                "montant": str(amount),
            },
        )
        return Response(WalletDetailSerializer(result["wallet"]).data, status=status.HTTP_200_OK)
