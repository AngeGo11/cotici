from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone

from apps.wallet.models import Transaction


def month_start():
    return timezone.now().replace(day=1, hour=0, minute=0, second=0, microsecond=0)


def get_monthly_entrees_sorties(user) -> tuple[Decimal, Decimal]:
    """Dépôts (entrées) et retraits + cotisations tontine (sorties) du mois en cours."""
    start = month_start()
    base = Transaction.objects.filter(
        wallet__user=user,
        statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
        date_transaction__gte=start,
    )
    entrees = base.filter(type_transaction=Transaction.TYPE_TRANSACTION.DEPOT).aggregate(
        total=Sum("montant_transaction"),
    )["total"] or Decimal("0")
    sorties = base.filter(
        type_transaction__in=(
            Transaction.TYPE_TRANSACTION.RETRAIT,
            Transaction.TYPE_TRANSACTION.DEBIT,
        ),
    ).aggregate(total=Sum("montant_transaction"))["total"] or Decimal("0")
    return entrees, sorties
