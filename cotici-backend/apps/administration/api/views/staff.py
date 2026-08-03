"""`/api/admin/staff/` : gestion des comptes staff.

Réservé au rôle disposant de `Perm.STAFF_MANAGE` (en pratique : super_admin).
Un membre du staff ne peut jamais modifier son propre profil (voir
`services/staff_service.py`).
"""
from __future__ import annotations

from rest_framework import status
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.administration.api.serializers.staff import (
    StaffCreateSerializer,
    StaffProfileSerializer,
    StaffRoleUpdateSerializer,
)
from apps.administration.domain.audit_actions import (
    STAFF_CREATED,
    STAFF_DEACTIVATED,
    STAFF_REACTIVATED,
    STAFF_ROLE_CHANGED,
    STAFF_TOTP_RESET,
)
from apps.administration.domain.errors import SelfModificationForbiddenError
from apps.administration.domain.roles import Perm
from apps.administration.mixins import StaffScopedViewSet
from apps.administration.models import StaffProfile
from apps.administration.permissions import HasStaffPermission
from apps.administration.repositories.staff_repository import list_staff_profiles
from apps.administration.services import staff_service


class StaffViewSet(StaffScopedViewSet):
    """CRUD (restreint) des `StaffProfile`."""

    queryset = StaffProfile.objects.none()  # surchargé par get_queryset()
    serializer_class = StaffProfileSerializer
    permission_classes = StaffScopedViewSet.permission_classes + [HasStaffPermission(Perm.STAFF_MANAGE)]
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_queryset(self):
        return list_staff_profiles()

    def get_audit_action(self) -> str:
        return {
            "create": STAFF_CREATED,
            "deactivate": STAFF_DEACTIVATED,
            "reactivate": STAFF_REACTIVATED,
            "change_role": STAFF_ROLE_CHANGED,
            "reset_totp": STAFF_TOTP_RESET,
        }.get(getattr(self, "action", ""), "")

    def create(self, request, *args, **kwargs):
        serializer = StaffCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        profile = staff_service.create_staff(created_by=request.user, **serializer.validated_data)
        self.record_audit(
            request,
            target_type="staff_profile",
            target_id=profile.pk,
            target_user=profile.user,
            after={"role": profile.role, "is_active": profile.is_active},
        )
        return Response(StaffProfileSerializer(profile).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=["patch"], url_path="role")
    def change_role(self, request, pk=None):
        profile = self.get_object()
        serializer = StaffRoleUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        self.enforce_reason_if_sensitive(STAFF_ROLE_CHANGED, serializer.validated_data["reason"])
        before = {"role": profile.role}
        try:
            profile = staff_service.change_role(
                actor=request.user, target_profile=profile, new_role=serializer.validated_data["role"]
            )
        except SelfModificationForbiddenError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)

        self.record_audit(
            request,
            target_type="staff_profile",
            target_id=profile.pk,
            target_user=profile.user,
            reason=serializer.validated_data["reason"],
            before=before,
            after={"role": profile.role},
        )
        return Response(StaffProfileSerializer(profile).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["patch"], url_path="deactivate")
    def deactivate(self, request, pk=None):
        profile = self.get_object()
        reason = (request.data or {}).get("reason", "")
        self.enforce_reason_if_sensitive(STAFF_DEACTIVATED, reason)
        before = {"is_active": profile.is_active}
        try:
            profile = staff_service.deactivate_staff(actor=request.user, target_profile=profile)
        except SelfModificationForbiddenError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)

        self.record_audit(
            request,
            target_type="staff_profile",
            target_id=profile.pk,
            target_user=profile.user,
            reason=reason,
            before=before,
            after={"is_active": profile.is_active},
        )
        return Response(StaffProfileSerializer(profile).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["patch"], url_path="reset-totp")
    def reset_totp(self, request, pk=None):
        profile = self.get_object()
        reason = (request.data or {}).get("reason", "")
        self.enforce_reason_if_sensitive(STAFF_TOTP_RESET, reason)
        before = {"totp_confirmed": profile.totp_confirmed_at is not None}
        try:
            profile = staff_service.reset_totp(actor=request.user, target_profile=profile)
        except SelfModificationForbiddenError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)

        self.record_audit(
            request,
            target_type="staff_profile",
            target_id=profile.pk,
            target_user=profile.user,
            reason=reason,
            before=before,
            after={"totp_confirmed": False},
        )
        return Response(StaffProfileSerializer(profile).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=["patch"], url_path="reactivate")
    def reactivate(self, request, pk=None):
        profile = self.get_object()
        reason = (request.data or {}).get("reason", "")
        self.enforce_reason_if_sensitive(STAFF_REACTIVATED, reason)
        before = {"is_active": profile.is_active}
        try:
            profile = staff_service.reactivate_staff(actor=request.user, target_profile=profile)
        except SelfModificationForbiddenError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_403_FORBIDDEN)

        self.record_audit(
            request,
            target_type="staff_profile",
            target_id=profile.pk,
            target_user=profile.user,
            reason=reason,
            before=before,
            after={"is_active": profile.is_active},
        )
        return Response(StaffProfileSerializer(profile).data, status=status.HTTP_200_OK)
