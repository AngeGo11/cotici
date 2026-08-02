"""Lecture unifiée des journaux d'audit (`AuditLog` "métier" +
`AdminActionLog` "back-office") pour l'écran d'audit du back-office.
"""
from __future__ import annotations

from apps.administration.repositories.audit_repository import (
    query_admin_action_logs,
    query_audit_logs,
)


def list_combined_entries(*, limit: int = 100, **filters) -> list[dict]:
    """Retourne une liste unifiée, triée par date décroissante, mélangeant
    les deux journaux. Chaque élément est un dict `{"source", "timestamp",
    "entry"}` où `entry` est l'instance ORM d'origine (AuditLog ou
    AdminActionLog), pour laisser le choix du serializer à l'appelant.
    """
    app_logs = query_audit_logs(
        user_id=filters.get("user_id"),
        action=filters.get("action"),
        search=filters.get("search"),
        date_from=filters.get("date_from"),
        date_to=filters.get("date_to"),
    )[:limit]
    admin_logs = query_admin_action_logs(
        actor_id=filters.get("actor_id"),
        action=filters.get("action"),
        target_user_id=filters.get("target_user_id"),
        search=filters.get("search"),
        date_from=filters.get("date_from"),
        date_to=filters.get("date_to"),
    )[:limit]

    combined = [
        {"source": "app", "timestamp": entry.timestamp, "entry": entry}
        for entry in app_logs
    ] + [
        {"source": "admin", "timestamp": entry.timestamp, "entry": entry}
        for entry in admin_logs
    ]
    combined.sort(key=lambda item: item["timestamp"], reverse=True)
    return combined[:limit]
