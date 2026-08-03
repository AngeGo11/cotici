"""`/api/admin/savings/` : consultation des épargnes personnelles.

Module strictement en lecture (`ReadOnlyModelViewSet`) : le contrat d'API est
figé à `list`/`retrieve`, aucune action d'écriture n'est prévue et aucun code
d'audit n'est réservé à ce module dans `domain/audit_actions.py` (une
consultation n'est pas une action de back-office journalisée — voir
`AuditedActionMixin` : seules les méthodes d'écriture le sont).

Réservé au staff disposant de `Perm.WALLET_READ`, sur la même base que
l'écran portefeuilles : un versement/retrait d'épargne est un mouvement de
wallet comme un autre (voir `apps.wallet.models.Transaction`).
"""
from __future__ import annotations

from rest_framework.viewsets import ReadOnlyModelViewSet

from apps.administration.api.serializers.savings import (
    SavingsDetailSerializer,
    SavingsListSerializer,
)
from apps.administration.authentication import AdminSessionAuthentication
from apps.administration.domain.roles import Perm
from apps.administration.pagination import AdminPageNumberPagination
from apps.administration.permissions import HasStaffPermission, IsStaffMember
from apps.administration.services import savings_admin_service
from apps.administration.throttling import AdminActionThrottle
from apps.savings.models import EpargnePersonnelle


class AdminSavingsViewSet(ReadOnlyModelViewSet):
    """Liste et fiche détail des `EpargnePersonnelle`.

    `ReadOnlyModelViewSet` : `create`/`update`/`partial_update`/`destroy` ne
    sont pas routés par DRF (seuls `list`/`retrieve` le sont), donc toute
    tentative d'écriture (POST/PATCH/PUT/DELETE sur `/savings/` ou
    `/savings/{id}/`) répond `405 Method Not Allowed` sans code applicatif
    supplémentaire.
    """

    queryset = EpargnePersonnelle.objects.none()  # surchargé par get_queryset()
    authentication_classes = [AdminSessionAuthentication]
    permission_classes = [IsStaffMember, HasStaffPermission(Perm.WALLET_READ)]
    throttle_classes = [AdminActionThrottle]
    throttle_scope = "admin_action"
    pagination_class = AdminPageNumberPagination

    def get_queryset(self):
        if self.action == "retrieve":
            return savings_admin_service.get_savings_detail_queryset()
        params = self.request.query_params
        return savings_admin_service.list_savings_queryset(
            search=params.get("search", ""),
            etat=params.get("etat", ""),
        )

    def get_serializer_class(self):
        if self.action == "retrieve":
            return SavingsDetailSerializer
        return SavingsListSerializer
