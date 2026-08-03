"""Backfill de `TontineRegle.delai_grace_heures` pour les règles existantes.

Valeur par défaut du champ (24h) appliquée par 0014 à toutes les lignes déjà
en base ; cette migration l'ajuste selon la fréquence de cotisation de chaque
règle, pour un délai de grâce cohérent avec la durée réelle d'un tour (24h de
grâce sur un tour JOURNALIER de 24h laisserait de facto 48h avant constat).

IMPORTANT : `penalites_automatiques` reste `False` sur TOUTES les lignes,
sans aucune exception — cette migration ne l'active NULLE PART. Activer une
fonctionnalité qui déclenche des débits financiers automatiques depuis une
migration de données est un anti-pattern : la migration est rejouée en CI, en
staging, lors d'une restauration de base... et débiterait alors des wallets
sans intervention humaine. Seul un administrateur, explicitement via
`modify_tontine_regle`, peut activer l'interrupteur.
"""
from __future__ import annotations

from django.db import migrations


def _delai_grace_heures(frequence: str, frequence_personalise) -> int:
    if frequence == "JOURNALIER":
        return 6
    if frequence == "HEBDOMADAIRE":
        return 24
    if frequence == "MENSUEL":
        return 72
    if frequence == "PERSONNALISÉE":
        freq_perso = frequence_personalise or 1
        return min(24 * max(1, freq_perso) // 4, 72)
    # Fréquence inconnue (ne devrait pas se produire) : conserve la valeur
    # par défaut du champ (24h) plutôt que de deviner.
    return 24


def backfill_delai_grace(apps, schema_editor):
    TontineRegle = apps.get_model("tontine", "TontineRegle")

    to_update = []
    for regle in TontineRegle.objects.all().iterator():
        regle.delai_grace_heures = _delai_grace_heures(
            regle.frequence, regle.frequence_personalise
        )
        to_update.append(regle)

    if to_update:
        TontineRegle.objects.bulk_update(to_update, ["delai_grace_heures"], batch_size=1000)


def noop_reverse(apps, schema_editor):
    """Pas de retour en arrière : `delai_grace_heures` redevient simplement la
    valeur par défaut du champ (24h) via le AddField précédent en cas de
    rollback complet, rien à faire ici."""


class Migration(migrations.Migration):

    dependencies = [
        ("tontine", "0014_penalites_auto_schema"),
    ]

    operations = [
        migrations.RunPython(backfill_delai_grace, noop_reverse),
    ]
