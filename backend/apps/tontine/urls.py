from django.urls import path

from .views import (
    attribute_penalite,
    changer_tour,
    create_tontine,
    define_tontine_regle,
    health,
    send_invitation,
)

urlpatterns = [
    path("health/", health, name="tontine-health"),
    path("create/", create_tontine, name="tontine-create"),
    path("regles/", define_tontine_regle, name="tontine-define-regles"),
    path("penalites/attribuer/", attribute_penalite, name="tontine-attribute-penalite"),
    path("tours/changer/", changer_tour, name="tontine-changer-tour"),
    path("invitations/", send_invitation, name="tontine-send-invitation"),
]
