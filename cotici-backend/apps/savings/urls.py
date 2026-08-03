from django.urls import path

from .views import (
    archive_savings,
    create_savings,
    delete_savings,
    deposit_to_savings,
    get_savings_detail,
    get_transactions_for_savings,
    health,
    list_archived_savings,
    list_savings,
    update_savings,
    withdraw_from_savings,
)

urlpatterns = [
    path("health/", health, name="savings-health"),
    path("", list_savings, name="savings-list"),
    path("archived/", list_archived_savings, name="savings-archived-list"),
    path("create/", create_savings, name="savings-create"),
    path("detail/", get_savings_detail, name="savings-detail"),
    path("update/", update_savings, name="savings-update"),
    path("deposit/", deposit_to_savings, name="savings-deposit"),
    path("withdraw/", withdraw_from_savings, name="savings-withdraw"),
    path("archive/", archive_savings, name="savings-archive"),
    path("delete/", delete_savings, name="savings-delete"),
    path("transactions/", get_transactions_for_savings, name="savings-transactions"),
]
