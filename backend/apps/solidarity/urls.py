from django.urls import path

from .views import health, create_solidarity_tontine

urlpatterns = [
    path("health/", health, name="solidarity-health"),
    path("create/", create_solidarity_tontine, name="create-solidarity-tontine"),
]
