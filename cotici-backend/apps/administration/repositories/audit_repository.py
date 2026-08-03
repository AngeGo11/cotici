"""Accès aux données d'audit consommées par le back-office
(`apps.audits.models.AuditLog` et `AdminActionLog`)."""
from __future__ import annotations

from django.db.models import Q

from apps.audits.models import AdminActionLog, AuditLog


def query_audit_logs(*, user_id=None, action=None, search=None, date_from=None, date_to=None):
    qs = AuditLog.objects.select_related("user").all()
    if user_id:
        qs = qs.filter(user_id=user_id)
    if action:
        qs = qs.filter(action=action)
    if search:
        qs = qs.filter(
            Q(action__icontains=search)
            | Q(user_display__icontains=search)
            | Q(resource__icontains=search)
        )
    if date_from:
        qs = qs.filter(timestamp__gte=date_from)
    if date_to:
        qs = qs.filter(timestamp__lte=date_to)
    return qs


def query_admin_action_logs(
    *, actor_id=None, action=None, target_user_id=None, search=None, date_from=None, date_to=None
):
    qs = AdminActionLog.objects.select_related("actor", "target_user").all()
    if actor_id:
        qs = qs.filter(actor_id=actor_id)
    if action:
        qs = qs.filter(action=action)
    if search:
        # Recherche libre de l'écran d'audit : opérateur, action, cible.
        qs = qs.filter(
            Q(action__icontains=search)
            | Q(actor__username__icontains=search)
            | Q(target_type__icontains=search)
            | Q(target_id__icontains=search)
        )
    if target_user_id:
        qs = qs.filter(target_user_id=target_user_id)
    if date_from:
        qs = qs.filter(timestamp__gte=date_from)
    if date_to:
        qs = qs.filter(timestamp__lte=date_to)
    return qs
