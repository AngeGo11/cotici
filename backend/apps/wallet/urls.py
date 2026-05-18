from django.urls import path

from .views import deposit, health, withdrawal

urlpatterns = [
    path("health/", health, name="wallet-health"),
    path("deposit/", deposit, name="wallet-deposit"),
    path("withdrawal/", withdrawal, name="wallet-withdrawal"),
]
