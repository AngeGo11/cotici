"""Parsing des filtres de requête pour les listes du back-office."""
from __future__ import annotations

from datetime import datetime, time

from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime


def parse_audit_filters(query_params) -> dict:
    limit = query_params.get("limit")
    try:
        limit = min(int(limit), 500) if limit else 100
    except (TypeError, ValueError):
        limit = 100

    date_from = parse_datetime(query_params.get("date_from", "") or "")
    date_to = parse_datetime(query_params.get("date_to", "") or "")

    return {
        "limit": limit,
        # L'écran d'audit envoie `search` : sans ce champ, sa barre de
        # recherche resterait silencieusement sans effet.
        "search": (query_params.get("search") or "").strip() or None,
        "action": query_params.get("action") or None,
        "user_id": query_params.get("user_id") or None,
        "actor_id": query_params.get("actor_id") or None,
        "target_user_id": query_params.get("target_user_id") or None,
        "date_from": date_from,
        "date_to": date_to,
    }


def _parse_day_bound(raw: str | None, *, end_of_day: bool) -> datetime | None:
    """Convertit une date "AAAA-MM-JJ" (input HTML `type=date`, cf.
    `DateRangePicker` front) en borne datetime aware (début ou fin de
    journée locale). Retombe sur `parse_datetime` si une valeur ISO complète
    est fournie, pour rester tolérant aux deux formats."""
    if not raw:
        return None
    date_value = parse_date(raw)
    if date_value is not None:
        naive = datetime.combine(date_value, time.max if end_of_day else time.min)
        return timezone.make_aware(naive, timezone.get_current_timezone())
    return parse_datetime(raw)


def parse_transaction_filters(query_params) -> dict:
    """Filtres de `GET /api/admin/transactions/` : statut, type, mode de
    paiement, plage de dates (sur `date_transaction`) et recherche libre
    (référence de transaction ou titulaire du wallet)."""
    return {
        "statut": query_params.get("statut") or query_params.get("status") or None,
        "type_transaction": query_params.get("type") or None,
        "mode_de_paiement": query_params.get("mode") or None,
        "date_from": _parse_day_bound(query_params.get("date_from"), end_of_day=False),
        "date_to": _parse_day_bound(query_params.get("date_to"), end_of_day=True),
        "search": query_params.get("search") or None,
    }
