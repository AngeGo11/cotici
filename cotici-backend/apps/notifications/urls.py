from django.urls import include, path
from rest_framework.routers import DefaultRouter

from apps.notifications.api.views import (
    NotificationPreferenceView,
    NotificationViewSet,
    register_device,
    unregister_device,
)

from .views import health

router = DefaultRouter()
router.register(r"", NotificationViewSet, basename="notification")

urlpatterns = [
    path("health/", health, name="notifications-health"),
    path("devices/", register_device, name="push-device-register"),
    path("devices/<str:expo_token>/", unregister_device, name="push-device-unregister"),
    path("preferences/", NotificationPreferenceView.as_view(), name="notification-preferences"),
    path("", include(router.urls)),
]
