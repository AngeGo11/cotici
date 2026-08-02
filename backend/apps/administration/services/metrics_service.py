"""Agrégations exposées au tableau de bord back-office.

Toutes les valeurs sont calculées à la volée (pas de table d'agrégats
pré-calculée) : les volumes manipulés en phase de lancement le permettent, et
cela évite d'introduire un état dérivé à réconcilier. Si la table
`wallet_transaction` devient trop volumineuse, ces requêtes sont les
premières candidates à une matérialisation quotidienne.

Deux règles de cohérence appliquées partout ici :

- "aujourd'hui" est la journée **locale** (`TIME_ZONE`), bornée à minuit :
  un opérateur lit un tableau de bord, pas un compteur glissant sur 24 h ;
- le "volume" ne compte que les transactions `RÉUSSIE` : une opération en
  attente ou échouée n'a déplacé aucun franc.
"""
from __future__ import annotations

from datetime import date, datetime, time, timedelta
from decimal import Decimal

from django.contrib.auth import get_user_model
from django.db.models import Count, Q, Sum
from django.db.models.functions import TruncDate
from django.utils import timezone

from apps.cagnotte.models import Cagnotte
from apps.tontine.models import Tontine
from apps.wallet.models import Transaction, Wallet

User = get_user_model()

#: Métriques acceptées par `time_series`. Le nom est fourni par le client
#: (querystring `metric`) : la liste blanche évite d'exposer un champ
#: arbitraire à l'agrégation.
SERIES_METRICS = frozenset({"transactions_volume", "transactions_count", "users_new"})

#: Bornes de la profondeur d'historique demandable (`days`).
MIN_SERIES_DAYS = 1
MAX_SERIES_DAYS = 365


def _day_start(day: date) -> datetime:
    """Minuit (heure locale) du jour donné, en datetime aware."""
    return timezone.make_aware(
        datetime.combine(day, time.min), timezone.get_current_timezone()
    )


def _client_users():
    """Utilisateurs "clients" : les comptes back-office (porteurs d'un
    `StaffProfile`) ne sont pas des utilisateurs de la plateforme et ne
    doivent jamais gonfler les compteurs produit."""
    return User.objects.filter(staff_profile__isnull=True)


def dashboard_stats() -> dict:
    """Indicateurs affichés en tête du tableau de bord.

    Le contrat de sortie est figé (voir `DashboardStats` côté front) : une
    clé manquante casse l'affichage, donc toutes sont renvoyées même quand le
    module métier correspondant n'existe pas encore.
    """
    today_start = _day_start(timezone.localdate())

    users = _client_users().aggregate(
        total=Count("id"),
        new_today=Count("id", filter=Q(date_joined__gte=today_start)),
    )

    wallets_balance_total = (
        Wallet.objects.aggregate(total=Sum("solde_courant"))["total"] or Decimal(0)
    )

    today_tx = Transaction.objects.filter(date_transaction__gte=today_start)
    transactions = today_tx.aggregate(
        count=Count("id"),
        volume=Sum(
            "montant_transaction",
            filter=Q(statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE),
        ),
        failed=Count(
            "id",
            filter=Q(statut_transaction=Transaction.STATUT_TRANSACTION.ECHOUEE),
        ),
    )

    # `Cagnotte` et `Solidarity` héritent de `Tontine` (héritage multi-table) :
    # sans le filtre sur `type_tontine`, une cagnotte serait comptée comme une
    # tontine.
    active_tontines = Tontine.objects.filter(
        est_active=True, etat=Tontine.ETAT.ACTIF
    )

    return {
        "users_total": users["total"],
        "users_new_today": users["new_today"],
        # KYC et litiges : modules de phase 1, non encore modélisés. On
        # renvoie 0 plutôt que d'omettre la clé, pour que le tableau de bord
        # affiche une carte neutre au lieu de casser.
        "kyc_pending": 0,
        "wallets_balance_total": wallets_balance_total,
        "transactions_today": transactions["count"],
        "transactions_volume_today": transactions["volume"] or Decimal(0),
        "transactions_failed_today": transactions["failed"],
        "tontines_active": active_tontines.filter(
            type_tontine=Tontine.TYPE_TONTINE.GROUPE
        ).count(),
        "cagnottes_active": Cagnotte.objects.filter(
            est_active=True, etat=Tontine.ETAT.ACTIF
        ).count(),
        "disputes_open": 0,
    }


def time_series(metric: str, days: int) -> list[dict]:
    """Série journalière de `metric` sur les `days` derniers jours (jour
    courant inclus).

    Les jours sans donnée sont renvoyés à 0 : c'est au graphe de montrer un
    creux, pas de sauter une date (un axe temporel troué se lit comme une
    tendance différente de la réalité).
    """
    if metric not in SERIES_METRICS:
        raise ValueError(f"Métrique inconnue : {metric}")

    days = max(MIN_SERIES_DAYS, min(int(days), MAX_SERIES_DAYS))
    end_day: date = timezone.localdate()
    start_day = end_day - timedelta(days=days - 1)
    start_dt = _day_start(start_day)
    tz = timezone.get_current_timezone()

    if metric == "users_new":
        rows = (
            _client_users()
            .filter(date_joined__gte=start_dt)
            .annotate(day=TruncDate("date_joined", tzinfo=tz))
            .values("day")
            .annotate(value=Count("id"))
        )
    else:
        queryset = Transaction.objects.filter(date_transaction__gte=start_dt)
        if metric == "transactions_volume":
            queryset = queryset.filter(
                statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE
            )
            aggregation = Sum("montant_transaction")
        else:
            aggregation = Count("id")
        rows = (
            queryset.annotate(day=TruncDate("date_transaction", tzinfo=tz))
            .values("day")
            .annotate(value=aggregation)
        )

    by_day = {row["day"]: row["value"] or 0 for row in rows}
    return [
        {
            "date": (start_day + timedelta(days=offset)).isoformat(),
            "value": by_day.get(start_day + timedelta(days=offset), 0),
        }
        for offset in range(days)
    ]
