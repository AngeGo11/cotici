"""`/api/admin/solidarity/` : consultation des tontines solidaires.

Lecture seule, réservée à `Perm.CAGNOTTE_READ` (c'est sous cette permission
que la route front `/solidarite` est routée — voir `admin/src/app/router.tsx`
: les tontines solidaires relèvent, côté back-office, du même périmètre de
lecture que les cagnottes). Le contrat d'API ne prévoit aucune action
d'écriture dédiée : seules `list`/`retrieve` sont exposées.
"""
from __future__ import annotations

from rest_framework.viewsets import ReadOnlyModelViewSet

from apps.administration.api.serializers.solidarity import SolidaritySerializer
from apps.administration.authentication import AdminSessionAuthentication
from apps.administration.domain.roles import Perm
from apps.administration.pagination import AdminPageNumberPagination
from apps.administration.permissions import HasStaffPermission, IsStaffMember
from apps.administration.services import solidarity_admin_service
from apps.solidarity.models import Solidarity


class SolidarityViewSet(ReadOnlyModelViewSet):
    """Lecture (liste + détail) des tontines solidaires."""

    queryset = Solidarity.objects.none()  # surchargé par get_queryset()
    serializer_class = SolidaritySerializer
    authentication_classes = [AdminSessionAuthentication]
    permission_classes = [IsStaffMember, HasStaffPermission(Perm.CAGNOTTE_READ)]
    pagination_class = AdminPageNumberPagination

    def get_queryset(self):
        params = self.request.query_params
        return solidarity_admin_service.list_solidarities(
            search=params.get("search", ""),
            etat=params.get("etat", ""),
            objectif_atteint=params.get("objectif_atteint", ""),
            versement_effectue=params.get("versement_effectue", ""),
        )
