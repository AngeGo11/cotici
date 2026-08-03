from django.urls import path

from .views import (
    health,
    create_cagnotte,
    cotiser_tontine,
    cagnotte_preview,
    list_my_cagnotte,
    list_my_contributions_to_cagnotte,
    recuperation_collecte,
)

urlpatterns = [
    path("health/", health, name="cagnotte-health"),
    path("create/", create_cagnotte, name="create-cagnotte"),
    path("cotiser/", cotiser_tontine, name="cagnotte-cotiser"),
    path("mine/", list_my_cagnotte, name="cagnotte-mine"),
    path("contributions/", list_my_contributions_to_cagnotte, name="cagnotte-contributions"),
    path("<int:tontine_id>/preview/", cagnotte_preview, name="cagnotte-preview"),
    path("<int:tontine_id>/verser/", recuperation_collecte, name="cagnotte-recuperation"),
]
