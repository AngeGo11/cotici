"""Middlewares du périmètre `/api/admin/`.

Trois middlewares, tous scoped sur les chemins commençant par `/api/admin/` :

- `AdminIpAllowlistMiddleware` : restreint l'accès par IP (allowlist CIDR).
- `SessionFreshnessMiddleware` : applique un idle-timeout applicatif sur la
  session administrateur.
- `AdminAuditTrailMiddleware` : journalise automatiquement toute requête
  d'écriture (non GET/HEAD) sur `/api/admin/`, y compris les échecs.

Positionnement attendu dans `MIDDLEWARE` (voir `config/settings.py`) :
`AdminIpAllowlistMiddleware` juste après `SecurityMiddleware` (le plus tôt
possible, avant même la résolution de session) ; `SessionFreshnessMiddleware`
et `AdminAuditTrailMiddleware` après `AuthenticationMiddleware` (ils ont
besoin de `request.user`).
"""
from __future__ import annotations

import ipaddress
import logging
import uuid

from django.conf import settings
from django.contrib.auth import logout as django_logout
from django.http import JsonResponse
from django.utils import timezone

from apps.administration.domain.audit_actions import ADMIN_REQUEST
from apps.audits.models import AdminActionLog
from apps.audits.services.admin_audit import record_admin_action

logger = logging.getLogger("cotici.administration")

ADMIN_PATH_PREFIX = "/api/admin/"
SESSION_LAST_ACTIVITY_KEY = "_admin_last_activity_ts"


def _is_admin_path(request) -> bool:
    return request.path.startswith(ADMIN_PATH_PREFIX)


class AdminIpAllowlistMiddleware:
    """Restreint l'accès à `/api/admin/` à une allowlist d'IP/CIDR.

    - `settings.ADMIN_IP_ALLOWLIST` vide -> autorisé si `DEBUG=True` (confort
      de développement local), refusé sinon (fail closed en production : pas
      d'allowlist configurée = personne n'accède au back-office).
    - `settings.ADMIN_TRUSTED_PROXY_COUNT` (int) : nombre de proxies de
      confiance en amont. Si `> 0`, l'en-tête `X-Forwarded-For` est lu et
      l'IP cliente réelle est celle située à la position `N+1` en partant de
      la FIN de la liste (la liste standard est
      "client, proxy1, proxy2, ..., proxyN" ajoutée par chaque proxy
      traversé). Si `== 0`, `X-Forwarded-For` n'est JAMAIS lu (évite qu'un
      client falsifie son IP en l'absence de proxy de confiance connu).
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def _parse_allowlist(self) -> list:
        raw = getattr(settings, "ADMIN_IP_ALLOWLIST", "") or ""
        networks = []
        for chunk in raw.split(","):
            chunk = chunk.strip()
            if not chunk:
                continue
            try:
                networks.append(ipaddress.ip_network(chunk, strict=False))
            except ValueError:
                logger.warning("ADMIN_IP_ALLOWLIST : entrée CIDR invalide ignorée: %r", chunk)
        return networks

    def _resolve_client_ip(self, request) -> str:
        trusted_proxy_count = int(getattr(settings, "ADMIN_TRUSTED_PROXY_COUNT", 0) or 0)
        if trusted_proxy_count > 0:
            forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR", "")
            hops = [hop.strip() for hop in forwarded_for.split(",") if hop.strip()]
            if hops:
                # "client, proxy1, ..., proxyN" : le client réel est à
                # l'indice len(hops) - trusted_proxy_count - 1 (en partant du
                # début), i.e. à la position `trusted_proxy_count + 1` en
                # partant de la fin.
                index_from_end = trusted_proxy_count + 1
                if len(hops) >= index_from_end:
                    return hops[-index_from_end]
                # Moins de sauts que de proxies de confiance déclarés : on ne
                # peut pas faire confiance à la valeur, on retombe sur le
                # premier élément connu (comportement fail-safe).
                return hops[0]
        return request.META.get("REMOTE_ADDR", "") or ""

    def __call__(self, request):
        if not _is_admin_path(request):
            return self.get_response(request)

        client_ip = self._resolve_client_ip(request)
        request.admin_client_ip = client_ip

        networks = self._parse_allowlist()
        if not networks:
            if not settings.DEBUG:
                logger.warning("Accès admin refusé (allowlist vide, DEBUG=False) ip=%s", client_ip)
                return JsonResponse(
                    {"detail": "Accès refusé : aucune allowlist IP configurée."}, status=403
                )
            return self.get_response(request)

        try:
            ip_obj = ipaddress.ip_address(client_ip)
        except ValueError:
            logger.warning("Accès admin refusé (IP illisible) ip=%r", client_ip)
            return JsonResponse({"detail": "Accès refusé."}, status=403)

        if not any(ip_obj in network for network in networks):
            logger.warning("Accès admin refusé (hors allowlist) ip=%s", client_ip)
            return JsonResponse({"detail": "Accès refusé : IP non autorisée."}, status=403)

        return self.get_response(request)


class SessionFreshnessMiddleware:
    """Idle-timeout applicatif sur la session administrateur.

    Contrairement à `SESSION_COOKIE_AGE` (durée de vie absolue du cookie),
    ceci invalide la session si elle est restée inactive plus de
    `settings.ADMIN_SESSION_IDLE_SECONDS` secondes, indépendamment de son âge
    absolu.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not _is_admin_path(request):
            return self.get_response(request)

        user = getattr(request, "user", None)
        if user is not None and getattr(user, "is_authenticated", False):
            idle_seconds = int(getattr(settings, "ADMIN_SESSION_IDLE_SECONDS", 900))
            now_ts = timezone.now().timestamp()
            last_activity = request.session.get(SESSION_LAST_ACTIVITY_KEY)
            if last_activity is not None and (now_ts - last_activity) > idle_seconds:
                django_logout(request)
                return JsonResponse(
                    {"detail": "Session expirée pour inactivité. Reconnectez-vous."}, status=401
                )
            request.session[SESSION_LAST_ACTIVITY_KEY] = now_ts

        return self.get_response(request)


class AdminAuditTrailMiddleware:
    """Journalise automatiquement toute requête d'écriture (non GET/HEAD) sur
    `/api/admin/`, y compris les réponses 403/500.

    Expose `request.admin_audit` (dict) AVANT l'appel de la vue, pour que
    celle-ci (ou un mixin, voir `mixins.AuditedActionMixin`) puisse
    l'enrichir (`action`, `target_type`, `target_id`, `target_user`,
    `reason`, `before`, `after`) avant l'écriture finale de l'entrée.

    N'écrit une entrée QUE si un membre du staff authentifié est identifiable
    (`AdminActionLog.actor` est un FK obligatoire) : les échecs de connexion
    anonymes sont tracés séparément par `StaffLoginAttempt`
    (voir `services/auth_service.py`).
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if not _is_admin_path(request) or request.method in ("GET", "HEAD"):
            return self.get_response(request)

        request.admin_audit = {
            "action": ADMIN_REQUEST,
            "target_type": "",
            "target_id": "",
            "target_user": None,
            "reason": "",
            "before": None,
            "after": None,
        }
        request.admin_request_id = uuid.uuid4().hex

        response = self.get_response(request)

        user = getattr(request, "user", None)
        if user is None or not getattr(user, "is_authenticated", False):
            return response

        status_code = response.status_code
        if status_code == 403:
            result = AdminActionLog.Result.DENIED
        elif status_code >= 400:
            result = AdminActionLog.Result.FAILURE
        else:
            result = AdminActionLog.Result.SUCCESS

        audit_payload = getattr(request, "admin_audit", {}) or {}
        profile = getattr(user, "staff_profile", None)
        try:
            record_admin_action(
                actor=user,
                actor_role=getattr(profile, "role", ""),
                action=audit_payload.get("action", ADMIN_REQUEST),
                request=request,
                target_type=audit_payload.get("target_type", ""),
                target_id=audit_payload.get("target_id", ""),
                target_user=audit_payload.get("target_user"),
                reason=audit_payload.get("reason", ""),
                before=audit_payload.get("before"),
                after=audit_payload.get("after"),
                status_code=status_code,
                result=result,
            )
        except Exception:  # noqa: BLE001 - l'audit ne doit jamais casser la réponse HTTP.
            logger.exception("Échec de l'écriture de l'entrée d'audit administrateur.")

        return response
