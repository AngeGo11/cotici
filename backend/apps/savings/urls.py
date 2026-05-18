from django.urls import path
from .views import create_savings

from .views import health

urlpatterns = [
    path("health/", health, name="savings-health"),
    path("create/", create_savings, name="tontine-create")
]
