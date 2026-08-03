"""Authentification dédiée au back-office administrateur.

Le back-office N'UTILISE JAMAIS les JWT mobiles (`JWTAuthentication`) : il
repose exclusivement sur une session Django isolée (cookie
`cotici_admin_sessionid`, voir `config/settings_admin.py`), protégée par CSRF
sur les méthodes d'écriture.

Pourquoi PAS de contrôle CSRF sur les lectures (GET/HEAD/OPTIONS) :
une version antérieure l'imposait sur toutes les méthodes, par excès de
prudence. C'était contre-productif. Le cookie de session est `SameSite=Strict`
(un site tiers ne peut donc pas déclencher de requête authentifiée) et la
politique CORS empêche d'en lire la réponse : le contrôle sur les lectures
n'apportait aucune protection supplémentaire. En revanche il cassait toute
rotation de jeton — `django.contrib.auth.login` appelle `rotate_token()`, si
bien que la première lecture suivant une connexion partait avec le jeton
d'avant rotation et était rejetée en 403, renvoyant l'utilisateur sur l'écran
de connexion.
"""
from __future__ import annotations

from rest_framework import exceptions
from rest_framework.authentication import SessionAuthentication


class AdminSessionAuthentication(SessionAuthentication):
    """Authentification par session Django pour `/api/admin/`.

    - Contrôle CSRF standard : appliqué aux méthodes d'écriture
      (POST/PUT/PATCH/DELETE), pas aux lectures.
    - Un header `Authorization: Bearer ...` (JWT mobile) est explicitement
      rejeté : le back-office ne doit jamais accepter un token émis pour
      l'application mobile, même par erreur de configuration côté client.
    """

    def authenticate(self, request):
        auth_header = request.META.get("HTTP_AUTHORIZATION", "")
        if auth_header.lower().startswith("bearer "):
            raise exceptions.AuthenticationFailed(
                "Le back-office administrateur n'accepte pas l'authentification par "
                "token Bearer (JWT) : seule une session administrateur est autorisée."
            )
        return super().authenticate(request)
