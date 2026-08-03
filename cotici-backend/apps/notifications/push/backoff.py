"""Politique de nouvelle tentative (retry) pour l'envoi/la vérification des push Expo.

Module pur, partagé par `push_dispatch` et `push_receipts` pour ne pas
dupliquer la politique de backoff entre les deux commands.
"""
from __future__ import annotations

# Backoff exponentiel : 1 min, 5 min, puis 25 min pour toutes les tentatives
# suivantes, jusqu'à `MAX_ATTEMPTS` essais au total avant abandon définitif
# (statut FAILED).
BACKOFF_MINUTES = [1, 5, 25]
MAX_ATTEMPTS = 6


def backoff_minutes(attempts: int) -> int:
    """Délai (en minutes) avant la prochaine tentative, pour `attempts` déjà effectuées."""
    idx = min(max(attempts - 1, 0), len(BACKOFF_MINUTES) - 1)
    return BACKOFF_MINUTES[idx]
