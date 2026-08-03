"""`GET /api/admin/me/` : profil du membre du staff actuellement connecté."""
from __future__ import annotations

from rest_framework.response import Response
from rest_framework.views import APIView

from apps.administration.api.serializers.me import AdminMeSerializer
from apps.administration.authentication import AdminSessionAuthentication
from apps.administration.permissions import IsStaffMember


class AdminMeView(APIView):
    authentication_classes = [AdminSessionAuthentication]
    permission_classes = [IsStaffMember]

    def get(self, request):
        return Response(AdminMeSerializer(request.user.staff_profile).data)
