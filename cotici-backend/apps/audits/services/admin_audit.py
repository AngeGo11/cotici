"""Point d'écriture unique du journal d'audit administrateur.

Toute écriture dans `AdminActionLog` DOIT transiter par
`record_admin_action` : cela garantit un format homogène (mêmes champs
renseignés) et un seul endroit à auditer pour vérifier que rien ne
contourne le journal.
"""
from __future__ import annotations

from typing import Any

from django.http import HttpRequest

from apps.audits.models import AdminActionLog


def _client_ip(request: HttpRequest | None) -> str | None:
    if request is None:
        return None
    # L'IP réelle (tenant compte d'un éventuel proxy de confiance) est déjà
    # résolue par `AdminIpAllowlistMiddleware` et posée sur `request.admin_client_ip`.
    ip = getattr(request, "admin_client_ip", None)
    if ip:
        return ip
    return request.META.get("REMOTE_ADDR") or None


def record_admin_action(
    *,
    actor,
    action: str,
    request: HttpRequest | None = None,
    actor_role: str = "",
    target_type: str = "",
    target_id: str = "",
    target_user=None,
    reason: str = "",
    before: dict[str, Any] | None = None,
    after: dict[str, Any] | None = None,
    status_code: int | None = None,
    result: str = AdminActionLog.Result.SUCCESS,
) -> AdminActionLog:
    """Crée une entrée `AdminActionLog`.

    `actor` peut être `None` uniquement si l'appelant fournit malgré tout un
    utilisateur "système" dédié en amont : `AdminActionLog.actor` est en
    PROTECT et NOT NULL, donc `actor` est un paramètre obligatoire ici.
    """
    request_id = ""
    http_method = ""
    path = ""
    user_agent = ""
    if request is not None:
        request_id = getattr(request, "admin_request_id", "") or request.META.get("HTTP_X_REQUEST_ID", "")
        http_method = request.method or ""
        path = request.path or ""
        user_agent = request.META.get("HTTP_USER_AGENT", "")[:512]

    return AdminActionLog.objects.create(
        actor=actor,
        actor_role=actor_role,
        action=action,
        target_type=target_type,
        target_id=str(target_id) if target_id else "",
        target_user=target_user,
        reason=reason,
        before=before,
        after=after,
        ip_address=_client_ip(request),
        user_agent=user_agent,
        request_id=request_id,
        http_method=http_method,
        path=path,
        status_code=status_code,
        result=result,
    )
