from decimal import Decimal

from django.db.models import Sum

from apps.savings.models import EpargnePersonnelle
from apps.wallet.models import Transaction
from apps.wallet.services.monthly_stats import month_start


def get_epargne_totale(user) -> Decimal:
    total = EpargnePersonnelle.objects.filter(hote=user).aggregate(
        total=Sum("montant_courant"),
    )["total"]
    return total or Decimal("0")


def get_tontine_cotisations_mois(user) -> Decimal:
    total = Transaction.objects.filter(
        wallet__user=user,
        statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
        type_transaction=Transaction.TYPE_TRANSACTION.DEBIT,
        date_transaction__gte=month_start(),
    ).aggregate(total=Sum("montant_transaction"))["total"]
    return total or Decimal("0")
