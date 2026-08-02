"""Réglages du back-office administrateur (`apps.administration`).

Importé en fin de `config/settings.py`. Isole explicitement les cookies
session/CSRF du back-office de ceux (potentiels) de l'application mobile —
qui, elle, n'utilise QUE des JWT Bearer et ne touche jamais aux cookies.

Toutes les valeurs ont des défauts sûrs "fail closed" : en l'absence de
configuration explicite (variables d'environnement `ADMIN_*`), le back-office
est plus restrictif, jamais plus permissif.
"""
from __future__ import annotations

import os

# Recalculé indépendamment de `settings.py` (plutôt que lu depuis son espace
# de noms global) : ce module est conçu pour être important via
# `from config.settings_admin import *` en toute fin de `settings.py`, ce qui
# exécute ce fichier comme un module à part entière (son propre __dict__),
# sans accès implicite aux variables déjà définies dans settings.py.
DEBUG = os.getenv("DJANGO_DEBUG", "False") == "True"

# --- Cookies de session (back-office) ---------------------------------
# Nom dédié : ne collisionne jamais avec un éventuel cookie de session côté
# app mobile (qui n'en utilise de toute façon aucun, JWT oblige).
SESSION_COOKIE_NAME = "cotici_admin_sessionid"
SESSION_COOKIE_HTTPONLY = True
# DEBUG est déjà défini plus haut dans settings.py au moment de cet import.
SESSION_COOKIE_SECURE = not DEBUG
SESSION_COOKIE_SAMESITE = "Strict"
SESSION_COOKIE_AGE = int(os.getenv("ADMIN_SESSION_COOKIE_AGE_SECONDS", str(8 * 60 * 60)))  # 8h
SESSION_EXPIRE_AT_BROWSER_CLOSE = True
SESSION_SAVE_EVERY_REQUEST = True  # nécessaire pour que l'idle-timeout applicatif soit fiable.

# --- Cookies CSRF (back-office) -----------------------------------------
CSRF_COOKIE_NAME = "cotici_admin_csrftoken"
CSRF_COOKIE_HTTPONLY = False  # le client JS doit pouvoir lire le token pour le renvoyer en header.
CSRF_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SAMESITE = "Strict"

# Origine du front back-office (nécessaire pour que Django accepte le Referer/
# Origin lors des vérifications CSRF). Vide par défaut : à renseigner en prod.
ADMIN_ORIGIN = os.getenv("ADMIN_ORIGIN", "")
if ADMIN_ORIGIN:
    CSRF_TRUSTED_ORIGINS = list(dict.fromkeys([*globals().get("CSRF_TRUSTED_ORIGINS", []), ADMIN_ORIGIN]))

# --- Allowlist IP -----------------------------------------------------------
# Liste de CIDR séparés par des virgules, ex: "41.66.12.0/24,102.212.0.0/16".
# Vide -> autorisé uniquement si DEBUG=True (voir AdminIpAllowlistMiddleware).
ADMIN_IP_ALLOWLIST = os.getenv("ADMIN_IP_ALLOWLIST", "")

# Nombre de proxies de confiance en amont (load balancer, reverse proxy...).
# 0 = on ignore totalement X-Forwarded-For (protection contre le spoofing).
ADMIN_TRUSTED_PROXY_COUNT = int(os.getenv("ADMIN_TRUSTED_PROXY_COUNT", "0"))

# --- Session / pré-authentification ----------------------------------------
# Idle-timeout applicatif (secondes) : au-delà, la session admin est
# invalidée même si le cookie est encore valide (SESSION_COOKIE_AGE).
ADMIN_SESSION_IDLE_SECONDS = int(os.getenv("ADMIN_SESSION_IDLE_SECONDS", "900"))  # 15 min

# TTL (secondes) de l'état de pré-authentification (entre l'étape mot de
# passe et l'étape TOTP).
ADMIN_PREAUTH_TTL_SECONDS = int(os.getenv("ADMIN_PREAUTH_TTL_SECONDS", "300"))  # 5 min

# --- TOTP --------------------------------------------------------------
TOTP_ISSUER = os.getenv("TOTP_ISSUER", "COTICI Admin")

# Second facteur obligatoire pour accéder au back-office.
#
# ATTENTION : à `False`, le mot de passe devient le SEUL rempart devant les
# soldes, les transactions et les données personnelles des utilisateurs, et
# `/api/admin/` n'est plus protégé que par l'allowlist IP. Ne désactiver qu'en
# développement local ; à remettre à `True` avant toute mise en production.
ADMIN_TOTP_REQUIRED = os.getenv("ADMIN_TOTP_REQUIRED", "True") == "True"
