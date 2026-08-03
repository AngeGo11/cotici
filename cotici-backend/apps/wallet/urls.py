from django.urls import path

from .views import (
    cinetpay_notify,
    cinetpay_transfer_notify,
    deposit,
    health,
    withdrawal,
    get_transaction_for_user,
)

urlpatterns = [
    path("health/", health, name="wallet-health"),
    path("deposit/", deposit, name="wallet-deposit"),
    # Webhook public CinetPay (server-to-server, sans JWT) : voir cinetpay_notify.
    path("deposit/notify/", cinetpay_notify, name="wallet-deposit-notify"),
    path("withdrawal/", withdrawal, name="wallet-withdrawal"),
    # Webhook public CinetPay Transfer/PayOut (server-to-server, sans JWT).
    path("withdrawal/notify/", cinetpay_transfer_notify, name="wallet-withdrawal-notify"),
    path("transactions/", get_transaction_for_user, name="wallet-transactions"),
]
