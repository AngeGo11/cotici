"""`/api/admin/settings/` : lecture et écriture des réglages plateforme.

`GET` est ouvert à tout membre du staff actif (`IsStaffMember`) : un réglage
n'est pas une donnée personnelle, et plusieurs écrans (KYC, transactions...)
pourraient vouloir les afficher en lecture seule à l'avenir sans porter la
permission `Perm.SETTINGS_WRITE`. `PATCH` est réservé à cette permission.

Le contrat REST retient `PATCH` (mise à jour PARTIELLE) plutôt que `PUT` sur
cette même URL : un formulaire n'affiche jamais forcément l'intégralité du
catalogue en une fois (regroupement par thème côté front), et exiger un `PUT`
imposerait de resoumettre toutes les clés à chaque enregistrement — un risque
inutile d'écraser silencieusement un réglage non affiché par le formulaire
courant. Seules les clés listées dans `changes` sont modifiées ; les autres
restent inchangées. `PUT` n'est donc pas implémenté sur cette route.
"""
from __future__ import annotations

from rest_framework.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.administration.api.serializers.settings import (
    PlatformSettingSerializer,
    PlatformSettingsUpdateSerializer,
)
from apps.administration.authentication import AdminSessionAuthentication
from apps.administration.domain.audit_actions import SETTINGS_CHANGED
from apps.administration.domain.errors import (
    InvalidSettingValueError,
    UnknownSettingKeyError,
)
from apps.administration.domain.roles import Perm
from apps.administration.mixins import AuditedActionMixin
from apps.administration.permissions import HasStaffPermission, IsStaffMember
from apps.administration.services import settings_service


class AdminSettingsView(AuditedActionMixin, APIView):
    """`GET`/`PATCH /api/admin/settings/`."""

    authentication_classes = [AdminSessionAuthentication]
    #: Action d'audit unique de cette vue (voir `AuditedActionMixin`) :
    #: `SETTINGS_CHANGED` est sensible, un motif est donc exigé sur `PATCH`.
    audit_action = SETTINGS_CHANGED

    def get_permissions(self):
        if self.request.method == "GET":
            return [IsStaffMember()]
        return [IsStaffMember(), HasStaffPermission(Perm.SETTINGS_WRITE)()]

    def get(self, request):
        data = settings_service.get_all_settings()
        return Response(PlatformSettingSerializer(data, many=True).data)

    def patch(self, request):
        serializer = PlatformSettingsUpdateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        changes = serializer.validated_data["changes"]
        reason = serializer.validated_data["reason"]

        # Contrôlé AVANT toute écriture : une action sensible sans motif ne
        # doit jamais atteindre la couche service.
        self.enforce_reason_if_sensitive(SETTINGS_CHANGED, reason)

        try:
            result = settings_service.update_settings(actor=request.user, changes=changes)
        except UnknownSettingKeyError as exc:
            raise ValidationError({"changes": str(exc)})
        except InvalidSettingValueError as exc:
            raise ValidationError({"changes": str(exc)})

        self.record_audit(
            request,
            target_type="platform_setting",
            target_id=",".join(sorted(result.changes.keys())),
            reason=reason,
            before={key: entry["before"] for key, entry in result.changes.items()},
            after={key: entry["after"] for key, entry in result.changes.items()},
        )

        return Response(PlatformSettingSerializer(result.settings, many=True).data)
