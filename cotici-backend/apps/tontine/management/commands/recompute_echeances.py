"""Recalcule `TourTontine.date_echeance` à partir de `scheduling.tour_echeance`.

`date_echeance` est un CACHE dérivé (voir le commentaire sur le champ dans
`apps.tontine.models.TourTontine`) : `apps.tontine.scheduling.tour_echeance`
reste la source de vérité. Cette command répare le cache en cas de
divergence — notamment après une correction manuelle (back-office) d'une
règle de tontine dont la fréquence/`frequence_personalise` a changé après la
création des tours.

Usage : `python manage.py recompute_echeances` (tous les tours EN_COURS) ou
`python manage.py recompute_echeances --tontine-id 42` (une seule tontine).
"""
from __future__ import annotations

from django.core.management.base import BaseCommand

from apps.tontine.models import TontineRegle, TourTontine
from apps.tontine.scheduling import tour_echeance


class Command(BaseCommand):
    help = (
        "Recalcule TourTontine.date_echeance (cache dérivé) pour les tours EN_COURS, "
        "à partir de la fréquence de cotisation actuelle de chaque tontine."
    )

    def add_arguments(self, parser):
        parser.add_argument("--tontine-id", type=int, default=None)

    def handle(self, *args, **options):
        qs = TourTontine.objects.filter(
            statut_tour=TourTontine.STATUT_TOUR.EN_COURS
        ).select_related("tontine", "tontine__tontineregle")
        tontine_id = options.get("tontine_id")
        if tontine_id is not None:
            qs = qs.filter(tontine_id=tontine_id)

        to_update = []
        for tour in qs:
            try:
                regle = tour.tontine.tontineregle
            except TontineRegle.DoesNotExist:
                continue
            echeance = tour_echeance(regle, tour)
            if echeance != tour.date_echeance:
                tour.date_echeance = echeance
                to_update.append(tour)

        if to_update:
            TourTontine.objects.bulk_update(to_update, ["date_echeance"])

        self.stdout.write(self.style.SUCCESS(f"{len(to_update)} tour(s) recalculé(s)."))
