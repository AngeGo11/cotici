from django.urls import path
from .views import create_savings, get_savings_detail, health, list_savings, update_savings, deposit_to_savings, get_transactions_for_savings

urlpatterns = [
    path("health/", health, name="savings-health"),
    path("", list_savings, name="savings-list"),
    path("create/", create_savings, name="savings-create"),
    path("detail/", get_savings_detail, name="savings-detail"),
    path("update/", update_savings, name="savings-update"),
    path("deposit/", deposit_to_savings, name="savings-deposit"),
    path("transactions/", get_transactions_for_savings, name="savings-transactions"),
]
