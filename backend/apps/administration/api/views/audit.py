"""`GET /api/admin/audit/` : lecture unifiée du journal d'audit
(AuditLog "métier" + AdminActionLog "back-office")."""
from __future__ import annotations

from rest_framework.permissions import BasePermission
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.administration.api.filters import parse_audit_filters
from apps.administration.api.serializers.audit import CombinedAuditEntrySerializer
from apps.administration.authentication import AdminSessionAuthentication
from apps.administration.domain.roles import Perm
from apps.administration.pagination import AdminPageNumberPagination
from apps.administration.permissions import HasStaffPermission, IsStaffMember
from apps.administration.services.audit_query_service import list_combined_entries


class AdminAuditLogListView(APIView):
    authentication_classes = [AdminSessionAuthentication]
    permission_classes = [IsStaffMember, HasStaffPermission(Perm.AUDIT_READ)]

    def get(self, request):
        filters = parse_audit_filters(request.query_params)
        entries = list_combined_entries(**filters)

        # Les deux journaux étant fusionnés en mémoire, la pagination DRF
        # standard (qui suppose un QuerySet) ne s'applique pas : on rend
        # néanmoins la même enveloppe `{count, next, previous, results}` que
        # le reste de l'API pour que le front n'ait qu'un seul format à gérer.
        paginator = AdminPageNumberPagination()
        page = paginator.paginate_queryset(entries, request, view=self)
        return paginator.get_paginated_response(
            CombinedAuditEntrySerializer(page, many=True).data
        )
