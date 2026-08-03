"""Règles pures de filtrage push par préférence utilisateur.

Module sans I/O : ne connaît ni le modèle `NotificationPreference`, ni
l'ORM — il reçoit des valeurs déjà résolues (catégorie, préférences en
mémoire, horodatage courant) et répond par des décisions pures, appliquées
par `NotificationService` au moment de décider de créer (ou non, ou
décalée) la ligne `PushOutbox`.
"""
from __future__ import annotations

from datetime import datetime, time, timedelta
from typing import Optional

# Catégories qui ignorent TOUJOURS les préférences de mute ET les quiet
# hours : un mouvement d'argent (paiement) ou un événement de sécurité
# (nouvelle connexion) est une obligation de transparence envers
# l'utilisateur, pas une notification de confort.
MANDATORY_CATEGORIES = {"securite", "paiement"}

# Fenêtre de silence par défaut (heure locale Abidjan, UTC+0 toute l'année —
# pas de changement d'heure en Côte d'Ivoire).
DEFAULT_QUIET_HOURS_START = time(21, 0)
DEFAULT_QUIET_HOURS_END = time(7, 0)


def push_allowed_for_category(
    category: str,
    *,
    push_enabled: bool,
    categories_muted: list[str],
) -> bool:
    """Le push doit-il être créé pour cette catégorie, compte tenu des préférences ?

    Ne décide PAS de l'horaire d'envoi (voir `next_send_time`) : uniquement
    si une ligne `PushOutbox` doit exister du tout. La notification in-app
    (`Notifications`), elle, est toujours créée quel que soit le résultat.
    """
    if category in MANDATORY_CATEGORIES:
        return True
    if not push_enabled:
        return False
    if category in (categories_muted or []):
        return False
    return True


def _in_quiet_hours(moment: time, start: time, end: time) -> bool:
    if start == end:
        return False
    if start < end:
        return start <= moment < end
    # Fenêtre à cheval sur minuit (ex: 21h -> 7h).
    return moment >= start or moment < end


def next_send_time(
    now: datetime,
    *,
    category: str,
    quiet_hours_start: Optional[time],
    quiet_hours_end: Optional[time],
) -> datetime:
    """Horodatage auquel le push peut effectivement être délivré.

    Les quiet hours ne suppriment jamais un push (le mettre en FAILED/DROPPED
    ferait perdre l'information) : elles décalent `next_attempt_at` au
    prochain instant hors fenêtre de silence. Les catégories obligatoires
    (`MANDATORY_CATEGORIES`) ignorent totalement les quiet hours — un
    paiement ou une alerte de sécurité ne doit jamais attendre le matin.

    Note fuseau : `TIME_ZONE = "UTC"` dans les réglages Django, et Abidjan
    est en UTC+0 toute l'année (pas de DST) — les composantes horaires de
    `now` (`timezone.now()`, stocké en UTC) sont donc déjà l'heure locale
    Abidjan, pas de conversion nécessaire.
    """
    if category in MANDATORY_CATEGORIES:
        return now

    start = quiet_hours_start or DEFAULT_QUIET_HOURS_START
    end = quiet_hours_end or DEFAULT_QUIET_HOURS_END

    if not _in_quiet_hours(now.time(), start, end):
        return now

    # Décale au prochain `end` (aujourd'hui si on est avant minuit dans une
    # fenêtre 21h->7h, sinon le jour même après minuit).
    candidate = now.replace(hour=end.hour, minute=end.minute, second=0, microsecond=0)
    if candidate <= now:
        candidate += timedelta(days=1)
    return candidate
