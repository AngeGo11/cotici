"""Backfill de `TourTontine.date_echeance` pour les tours déjà existants.

Logique dupliquée (volontairement, pas d'import de code applicatif dans une
migration) de `apps.tontine.scheduling.tour_echeance` : échéance = date de
début du tour + durée de la fréquence de cotisation de la tontine. MENSUEL
est approximé à 30 jours, cohérent avec le reste du modèle qui ne distingue
pas les mois calendaires.
"""
from __future__ import annotations

from datetime import timedelta
from typing import Optional

from django.db import migrations


def _delta_days(frequence: str, frequence_personalise) -> Optional[int]:
    if frequence == "JOURNALIER":
        return 1
    if frequence == "HEBDOMADAIRE":
        return 7
    if frequence == "MENSUEL":
        return 30
    if frequence == "PERSONNALISÉE":
        return frequence_personalise or None
    return None


def backfill_date_echeance(apps, schema_editor):
    TourTontine = apps.get_model("tontine", "TourTontine")
    TontineRegle = apps.get_model("tontine", "TontineRegle")

    regles_by_tontine = {r.tontine_id: r for r in TontineRegle.objects.all()}

    to_update = []
    for tour in TourTontine.objects.filter(date_echeance__isnull=True).iterator():
        regle = regles_by_tontine.get(tour.tontine_id)
        if regle is None:
            continue
        days = _delta_days(regle.frequence, regle.frequence_personalise)
        if days is None:
            continue
        tour.date_echeance = tour.date + timedelta(days=days)
        to_update.append(tour)

    if to_update:
        TourTontine.objects.bulk_update(to_update, ["date_echeance"], batch_size=1000)


def noop_reverse(apps, schema_editor):
    """Pas de retour en arrière : `date_echeance` redevient simplement NULL
    via le AddField précédent en cas de rollback complet, rien à faire ici."""


class Migration(migrations.Migration):

    dependencies = [
        ("tontine", "0012_penalite_date_annulation_penalite_est_annulee_and_more"),
    ]

    operations = [
        migrations.RunPython(backfill_date_echeance, noop_reverse),
    ]
