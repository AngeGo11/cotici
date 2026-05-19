from django.urls import path

from .views import deposit, health, withdrawal, get_transaction_for_user

urlpatterns = [
    path("health/", health, name="wallet-health"),
    path("deposit/", deposit, name="wallet-deposit"),
    path("withdrawal/", withdrawal, name="wallet-withdrawal"),
    path("transactions/", get_transaction_for_user, name="wallet-transactions"),
]
