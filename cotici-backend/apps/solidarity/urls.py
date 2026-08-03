from django.urls import path

from .views import (
    health,
    create_solidarity_tontine,
    cotiser_tontine,
    solidarity_preview,
    list_my_solidarity,
    list_my_contributions,
    verser_beneficiaire,
    archive_solidarity,
    delete_solidarity,
)

urlpatterns = [
    path("health/", health, name="solidarity-health"),
    path("create/", create_solidarity_tontine, name="create-solidarity-tontine"),
    path("cotiser/", cotiser_tontine, name="solidarity-cotiser"),
    path("mine/", list_my_solidarity, name="solidarity-mine"),
    path("contributions/", list_my_contributions, name="solidarity-contributions"),
    path("archive/", archive_solidarity, name="solidarity-archive"),
    path("delete/", delete_solidarity, name="solidarity-delete"),
    path("<int:tontine_id>/preview/", solidarity_preview, name="solidarity-preview"),
    path("<int:tontine_id>/verser/", verser_beneficiaire, name="solidarity-verser"),
]
