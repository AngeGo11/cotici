"""Throttling dédié au back-office administrateur.

Deux scopes distincts (voir `DEFAULT_THROTTLE_RATES` dans
`config/settings.py`) : `admin_login` (bruteforce mot de passe/TOTP) et
`admin_action` (rythme des actions sensibles), pour ne jamais partager le
même seau que les endpoints mobiles (`otp_request`, `login_attempt`...).
"""
from __future__ import annotations

from rest_framework.throttling import ScopedRateThrottle, SimpleRateThrottle


class AdminLoginThrottle(ScopedRateThrottle):
    """Limite les tentatives de connexion au back-office par IP (ou par
    utilisateur si authentifié — non pertinent ici puisqu'appelée sur des
    vues anonymes).

    `ScopedRateThrottle` lit le scope sur `view.throttle_scope` (et NON sur
    cette classe) : les vues qui utilisent ce throttle DOIVENT définir
    `throttle_scope = "admin_login"`.

    Combinée à `AdminLoginByAccountThrottle` (par identifiant tenté), pour
    couvrir à la fois le bruteforce "un compte depuis plusieurs IP" et
    "plusieurs comptes depuis une même IP".
    """


class AdminLoginByAccountThrottle(SimpleRateThrottle):
    """Limite les tentatives de connexion au back-office par identifiant
    tenté (numéro de téléphone / username), indépendamment de l'IP source.
    """

    scope = "admin_login"

    def get_cache_key(self, request, view):
        username = (request.data.get("identifiant") or request.data.get("username") or "").strip().lower()
        if not username:
            return None
        return self.cache_format % {"scope": self.scope, "ident": f"account:{username}"}


class AdminActionThrottle(ScopedRateThrottle):
    """Limite le rythme des actions sensibles (écritures) sur le back-office,
    une fois la session administrateur établie.

    Les vues utilisant ce throttle DOIVENT définir `throttle_scope = "admin_action"`.
    """
