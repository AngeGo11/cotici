"""URLs du back-office administrateur, montées sous `/api/admin/`
(voir `config/urls.py`)."""
from __future__ import annotations

from django.urls import include, path

from apps.administration.api.routers import router
from apps.administration.api.views.audit import AdminAuditLogListView
from apps.administration.api.views.auth import (
    AdminCsrfView,
    AdminLoginView,
    AdminLogoutView,
    AdminTotpSetupView,
    AdminTotpVerifyView,
)
from apps.administration.api.views.me import AdminMeView
from apps.administration.api.views.metrics import (
    AdminDashboardSeriesView,
    AdminDashboardStatsView,
)
from apps.administration.api.views.settings import AdminSettingsView

urlpatterns = [
    path("auth/csrf/", AdminCsrfView.as_view(), name="admin-auth-csrf"),
    path("auth/login/", AdminLoginView.as_view(), name="admin-auth-login"),
    path("auth/totp/setup/", AdminTotpSetupView.as_view(), name="admin-auth-totp-setup"),
    path("auth/totp/verify/", AdminTotpVerifyView.as_view(), name="admin-auth-totp-verify"),
    path("auth/logout/", AdminLogoutView.as_view(), name="admin-auth-logout"),
    path("me/", AdminMeView.as_view(), name="admin-me"),
    path("audit/", AdminAuditLogListView.as_view(), name="admin-audit-list"),
    path(
        "dashboard/stats/",
        AdminDashboardStatsView.as_view(),
        name="admin-dashboard-stats",
    ),
    path(
        "dashboard/series/",
        AdminDashboardSeriesView.as_view(),
        name="admin-dashboard-series",
    ),
    path("settings/", AdminSettingsView.as_view(), name="admin-settings"),
    path("", include(router.urls)),
]
