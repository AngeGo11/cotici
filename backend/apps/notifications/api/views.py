from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.viewsets import ReadOnlyModelViewSet

from apps.notifications.api.serializers import (
    NotificationPreferenceSerializer,
    NotificationSerializer,
    PushDeviceRegisterSerializer,
)
from apps.notifications.models import NotificationPreference, PushDevice
from apps.notifications.repositories.notification_repository import NotificationRepository
from apps.notifications.services.notification_service import NotificationService


class NotificationViewSet(ReadOnlyModelViewSet):
    """Lecture seule des notifications de l'utilisateur connecté.

    `get_queryset` part TOUJOURS de `NotificationRepository.for_user`, seul
    point d'accès en lecture : impossible de lister/consulter/marquer comme
    lue la notification d'un autre utilisateur (404 naturel, pas de fuite
    d'existence — voir tests IDOR).
    """

    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        qs = NotificationRepository.for_user(self.request.user)
        if self.request.query_params.get("unread") == "true":
            qs = qs.filter(est_lue=False)
        return qs

    @action(detail=False, methods=["get"])
    def unread_count(self, request):
        return Response({"unread": NotificationService.unread_count(request.user)})

    @action(detail=True, methods=["post"])
    def mark_read(self, request, pk=None):
        # self.get_object() lève un Http404 (pk invalide OU notification n'appartenant
        # pas à request.user, puisque get_queryset() est déjà filtré) avant même
        # d'atteindre le service — comportement 404 "naturel" pour l'IDOR.
        notif = self.get_object()
        NotificationService.mark_read(request.user, notif.pk)
        return Response({"detail": "Notification marquée comme lue."})

    @action(detail=False, methods=["post"])
    def mark_all_read(self, request):
        updated = NotificationService.mark_all_read(request.user)
        return Response({"updated": updated})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def register_device(request):
    """`POST /api/notifications/devices/` — enregistre/réattribue un appareil.

    Idempotent via `update_or_create(expo_token=...)` : rejouer l'appel avec
    le même token (ex. relance de l'app) ne crée pas de doublon. Le token est
    UNIQUE globalement (pas par utilisateur) : s'il était précédemment
    attribué à un autre utilisateur (téléphone revendu, app réinstallée avec
    un nouveau compte), il migre intégralement vers `request.user` — c'est le
    comportement voulu, voir `PushDevice` docstring, sinon l'ancien
    propriétaire du téléphone continuerait de recevoir les push du nouveau.
    """
    serializer = PushDeviceRegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    data = serializer.validated_data

    PushDevice.objects.update_or_create(
        expo_token=data["expo_token"],
        defaults={
            "user": request.user,
            "device_id": data.get("device_id", ""),
            "platform": data["platform"],
            "app_version": data.get("app_version", ""),
            "is_active": True,
            "failure_count": 0,
            "last_error": "",
            "last_seen_at": timezone.now(),
        },
    )
    return Response({"ok": True}, status=status.HTTP_200_OK)


@api_view(["DELETE"])
@permission_classes([IsAuthenticated])
def unregister_device(request, expo_token: str):
    """`DELETE /api/notifications/devices/<expo_token>/` — appelé au logout.

    Filtré par `user=request.user` : impossible de supprimer l'appareil d'un
    autre utilisateur, même en connaissant/devinant son token (anti-IDOR).
    Silencieux (204) si le token n'appartient pas (ou plus) à l'appelant, par
    cohérence avec le reste de l'app (pas de fuite d'existence).
    """
    PushDevice.objects.filter(user=request.user, expo_token=expo_token).delete()
    return Response(status=status.HTTP_204_NO_CONTENT)


class NotificationPreferenceView(APIView):
    """`GET`/`PATCH /api/notifications/preferences/` — préférences de l'utilisateur connecté.

    Ne prend jamais d'identifiant utilisateur en paramètre : toujours résolu
    depuis `request.user` (`get_or_create`), donc structurellement à l'abri
    d'un IDOR (aucune façon d'adresser les préférences d'un autre compte).
    """

    permission_classes = [IsAuthenticated]

    def _get_preference(self, user) -> NotificationPreference:
        pref, _ = NotificationPreference.objects.get_or_create(user=user)
        return pref

    def get(self, request):
        pref = self._get_preference(request.user)
        return Response(NotificationPreferenceSerializer(pref).data)

    def patch(self, request):
        pref = self._get_preference(request.user)
        serializer = NotificationPreferenceSerializer(pref, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        return Response(serializer.data)
