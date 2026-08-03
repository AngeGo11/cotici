"""Calcul pur de l'échéance des tours de tontine.

Module sans I/O : ne touche jamais l'ORM (hormis les types passés en
paramètre). Il est la SEULE source de vérité pour dériver une échéance à
partir d'une fréquence de cotisation — `TourTontine.date_echeance` n'est
qu'un CACHE dérivé de ce calcul, renseigné à la création du tour (voir
`apps/tontine/views.py`) pour permettre un filtrage SQL efficace côté jobs
de notification (`apps/notifications/management/commands/`). En cas de
divergence (bug, changement de règle a posteriori), `recompute_echeances`
recalcule ce cache à partir de ce module.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional

from apps.tontine.models import TontineRegle, TourTontine

# Durée d'un tour selon la fréquence de cotisation de la tontine. MENSUEL est
# approximé à 30 jours (pas de calendrier de mois calendaire ici, cohérent
# avec le reste du modèle qui ne fait pas non plus cette distinction).
_FREQUENCE_DELTA: dict[str, timedelta] = {
    TontineRegle.FREQUENCE_COTISATION.JOURNALIER: timedelta(days=1),
    TontineRegle.FREQUENCE_COTISATION.HEBDOMADAIRE: timedelta(days=7),
    TontineRegle.FREQUENCE_COTISATION.MENSUEL: timedelta(days=30),
}


def frequence_delta(regle: TontineRegle) -> Optional[timedelta]:
    """Durée d'un tour pour la fréquence de cotisation de `regle`, ou None si
    elle ne peut pas être déterminée (PERSONNALISE sans `frequence_personalise`)."""
    if regle.frequence == TontineRegle.FREQUENCE_COTISATION.PERSONNALISE:
        if not regle.frequence_personalise:
            return None
        return timedelta(days=regle.frequence_personalise)
    return _FREQUENCE_DELTA.get(regle.frequence)


def tour_echeance(regle: TontineRegle, tour: TourTontine) -> Optional[datetime]:
    """Échéance calculée du tour = date de début du tour + durée de la fréquence.

    Retourne None si la durée ne peut pas être déterminée.
    """
    delta = frequence_delta(regle)
    if delta is None:
        return None
    return tour.date + delta


# ---------------------------------------------------------------------------
# Fenêtres de rappel / retard, adaptées à la fréquence de cotisation.
#
# La fenêtre fixe de 48h historique était inapplicable à JOURNALIER : le tour
# dure lui-même 24h, un rappel "48h avant échéance" tomberait avant même
# l'ouverture du tour. Chaque fréquence a donc son propre calendrier de
# rappels (avant échéance) et de relances de retard (après échéance), avec un
# plafond dur de `MAX_RETARD_RELANCES` relances anti-harcèlement.
# ---------------------------------------------------------------------------

MAX_RETARD_RELANCES = 2


def _reminder_offsets(regle: TontineRegle) -> list[tuple[timedelta, str]]:
    """Liste (offset avant échéance, libellé) des rappels à programmer.

    Le libellé alimente `domain.dedup.dedup_cotisation_rappel` (offset_label)
    et sert à choisir la spec de contenu adaptée (J0 = jour J / ouverture).
    """
    F = TontineRegle.FREQUENCE_COTISATION
    freq = regle.frequence
    if freq == F.JOURNALIER:
        # Rappel unique combiné, émis à l'ouverture du tour (voir
        # `reminder_targets` : aucune fenêtre "avant" n'a de sens ici).
        return [(timedelta(0), "J0")]
    if freq == F.HEBDOMADAIRE:
        return [(timedelta(days=1), "J1"), (timedelta(0), "J0")]
    if freq == F.MENSUEL:
        return [(timedelta(days=3), "J3"), (timedelta(days=1), "J1"), (timedelta(0), "J0")]
    if freq == F.PERSONNALISE:
        x = regle.frequence_personalise or 0
        if x >= 4:
            return [(timedelta(days=2), "J2"), (timedelta(0), "J0")]
        return [(timedelta(0), "J0")]
    return []


def reminder_targets(regle: TontineRegle, tour: TourTontine) -> list[dict]:
    """Calcule, pour un tour donné, les rappels à envoyer et leur fenêtre de rattrapage.

    Chaque élément retourné est `{"label", "target_at", "window_start",
    "window_end"}`. Un job (`notify_tour_reminders`, cadence horaire) doit
    émettre le rappel `label` dès que `window_start <= now <= window_end`
    (idempotent via `dedup_cotisation_rappel`). Règle générale de fenêtre :
    `min(48h, delta * 0.2)`, jamais avant le début effectif du tour.
    """
    delta = frequence_delta(regle)
    echeance = tour_echeance(regle, tour)
    if delta is None or echeance is None:
        return []

    window = min(timedelta(hours=48), delta * 0.2)
    is_journalier = regle.frequence == TontineRegle.FREQUENCE_COTISATION.JOURNALIER

    targets: list[dict] = []
    for offset, label in _reminder_offsets(regle):
        if is_journalier:
            # "à l'ouverture du tour" : fenêtre = toute la durée du tour, pas
            # de recul avant échéance (durée du tour = durée de la fenêtre).
            target_at = tour.date
            window_start = tour.date
            window_end = echeance
        else:
            target_at = echeance - offset
            window_start = max(tour.date, target_at - window)
            window_end = target_at
        targets.append(
            {
                "label": label,
                "target_at": target_at,
                "window_start": window_start,
                "window_end": window_end,
            }
        )
    return targets


def retard_offsets(regle: TontineRegle) -> list[timedelta]:
    """Décalages après échéance auxquels une relance de retard peut être envoyée.

    Toujours `len(...) <= MAX_RETARD_RELANCES` (anti-harcèlement).
    """
    F = TontineRegle.FREQUENCE_COTISATION
    freq = regle.frequence
    if freq == F.JOURNALIER:
        return [timedelta(hours=3)]
    if freq == F.MENSUEL:
        return [timedelta(days=1), timedelta(days=3)]
    if freq in (F.HEBDOMADAIRE, F.PERSONNALISE):
        return [timedelta(days=1)]
    return []


# ---------------------------------------------------------------------------
# Clôture forcée à échéance (règle produit 2026) : "23h59" heure locale.
#
# `tour_echeance` ci-dessus reste le cache canonique de `TourTontine.date_echeance`
# (calcul brut `tour.date + delta`, sans alignement de fin de journée) : le
# modifier casserait les rappels déjà calibrés dessus (`reminder_targets`) et
# le contrat mobile qui lit ce champ tel quel. La clôture forcée a besoin d'un
# instant PRÉCIS ("23h59:59 heure locale du jour d'échéance / de fin de mois")
# qui n'est PAS ce cache : ces fonctions le dérivent séparément, à la volée,
# sans jamais réécrire `date_echeance`.
# ---------------------------------------------------------------------------
import calendar

try:  # Python 3.9+ (stdlib) — présent dans l'environnement cible du projet.
    from zoneinfo import ZoneInfo
except ImportError:  # pragma: no cover - filet de sécurité, non attendu en prod.
    ZoneInfo = None  # type: ignore[assignment]


def _local_zone():
    from django.conf import settings

    tz_name = getattr(settings, "TONTINE_TIMEZONE", "Africa/Abidjan")
    if ZoneInfo is None:  # pragma: no cover
        from django.utils import timezone as dj_tz

        return dj_tz.get_default_timezone()
    return ZoneInfo(tz_name)


def cloture_cutoff(regle: TontineRegle, tour: TourTontine) -> Optional[datetime]:
    """Instant exact de clôture forcée de `tour`, "23h59:59" heure locale :

    - JOURNALIER : même jour calendaire local que l'ouverture du tour ;
    - HEBDOMADAIRE : jour calendaire local J+7 après l'ouverture ;
    - MENSUEL : dernier jour calendaire local du mois d'ouverture ;
    - PERSONNALISÉE : jour calendaire local `tour.date + frequence_personalise` jours.

    Retourne `None` si la durée ne peut être déterminée (mêmes conditions que
    `tour_echeance`) — dans ce cas, aucune clôture automatique n'est possible
    pour ce tour (nécessite une intervention manuelle via l'API existante).
    """
    delta = frequence_delta(regle)
    if delta is None:
        return None

    tz = _local_zone()
    ouverture_locale = tour.date.astimezone(tz)
    F = TontineRegle.FREQUENCE_COTISATION

    if regle.frequence == F.MENSUEL:
        annee, mois = ouverture_locale.year, ouverture_locale.month
        dernier_jour = calendar.monthrange(annee, mois)[1]
        jour_cutoff = ouverture_locale.replace(day=dernier_jour)
    else:
        jour_cutoff = ouverture_locale + delta

    cutoff_local = jour_cutoff.replace(hour=23, minute=59, second=59, microsecond=0)
    return cutoff_local.astimezone(tz).astimezone(tour.date.tzinfo or tz)
