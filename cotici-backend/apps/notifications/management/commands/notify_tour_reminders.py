"""Envoie les rappels de cotisation (avant échéance), adaptés à la fréquence.

Remplace l'ancienne command `send_cotisation_reminders` (fenêtre fixe de 48h,
inapplicable aux tontines JOURNALIER dont le tour dure lui-même 24h). Le
calendrier de rappels par fréquence est centralisé dans
`apps.tontine.scheduling.reminder_targets` — voir ce module pour le détail
des offsets (J-3/J-2/J-1/J0 selon la fréquence).

Cadence recommandée : horaire (cron), idempotent (dedup_key), verrouillé par
`pg_try_advisory_lock` (voir `_job_utils.job_lock`).

Performance : ~6 requêtes par exécution quel que soit le nombre de
tours/membres concernés (voir le détail dans `_run`), au lieu du ~2×M×T
requêtes de l'ancienne implémentation naïve (une requête "membre payé ?" par
membre et par tour).
"""
from __future__ import annotations

import dataclasses
from collections import defaultdict
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.notifications.domain.catalog import spec_cotisation_a_venir, spec_cotisation_jour_j
from apps.notifications.domain.dedup import dedup_cotisation_rappel
from apps.notifications.management.commands._job_utils import job_lock, job_run
from apps.notifications.services.notification_service import NotificationService
from apps.tontine.models import TontineMembre, TontineRegle, TourTontine
from apps.tontine.scheduling import reminder_targets
from apps.wallet.models import Transaction

# Prefiltre SQL large mais borné : couvre le pire cas (MENSUEL, rappel J-3
# avec une fenêtre de rattrapage de 48h => jusqu'à 5 jours avant l'échéance)
# avec une marge de sécurité. Le filtrage précis (fenêtre exacte par offset)
# se fait ensuite en Python via `reminder_targets`.
_PREFILTER_LOWER = timedelta(days=2)
_PREFILTER_UPPER = timedelta(days=6)


class Command(BaseCommand):
    help = (
        "Envoie les rappels de cotisation (idempotents) adaptés à la fréquence de "
        "chaque tontine, aux membres n'ayant pas encore cotisé pour le tour en cours. "
        "Destinée à être planifiée toutes les heures via un cron système externe."
    )

    def handle(self, *args, **options):
        job_name = "notify_tour_reminders"
        with job_lock(job_name) as acquired:
            if not acquired:
                self.stdout.write(
                    self.style.WARNING(f"{job_name} : une instance tourne déjà, sortie.")
                )
                return
            with job_run(job_name):
                sent = self._run()
        self.stdout.write(self.style.SUCCESS(f"{sent} rappel(s) émis (idempotent)."))

    def _run(self) -> int:
        now = timezone.now()
        lower = now - _PREFILTER_LOWER
        upper = now + _PREFILTER_UPPER

        # (1) Tours candidats, filtrés en SQL sur le cache `date_echeance`.
        tours = list(
            TourTontine.objects.filter(
                statut_tour=TourTontine.STATUT_TOUR.EN_COURS,
                date_echeance__isnull=False,
                date_echeance__range=(lower, upper),
            ).select_related("tontine", "tontine__tontineregle")
        )
        if not tours:
            return 0

        tontine_ids = {t.tontine_id for t in tours}
        tour_ids = [t.id for t in tours]

        # (2) Membres actifs de toutes les tontines concernées, une seule requête.
        membres_by_tontine: dict[int, list[TontineMembre]] = defaultdict(list)
        for tm in TontineMembre.objects.filter(
            tontine_id__in=tontine_ids,
            statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
        ).select_related("membre"):
            membres_by_tontine[tm.tontine_id].append(tm)

        # (3) Paiements déjà réglés pour ces tours, une seule requête groupée.
        paid_by_tour: dict[int, set[int]] = defaultdict(set)
        for tour_id, user_id in Transaction.objects.filter(
            tour_id__in=tour_ids,
            type_transaction=Transaction.TYPE_TRANSACTION.DEBIT,
            statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
        ).values_list("tour_id", "wallet__user_id"):
            paid_by_tour[tour_id].add(user_id)

        items: list[tuple] = []
        for tour in tours:
            try:
                regle = tour.tontine.tontineregle
            except TontineRegle.DoesNotExist:
                continue

            targets = reminder_targets(regle, tour)
            if not targets:
                continue

            paid_ids = paid_by_tour.get(tour.id, set())
            membres = membres_by_tontine.get(tour.tontine_id, [])

            for target in targets:
                # Arrêt immédiat dès qu'une Transaction DEBIT réussie existe :
                # géré membre par membre ci-dessous (paid_ids), pas ici.
                if not (target["window_start"] <= now <= target["window_end"]):
                    continue

                for tm in membres:
                    if tm.membre_id in paid_ids:
                        continue

                    dedup_key = dedup_cotisation_rappel(
                        tour_id=tour.id, user_id=tm.membre_id, offset_label=target["label"]
                    )
                    if target["label"] == "J0":
                        spec = spec_cotisation_jour_j(
                            tontine_nom=tour.tontine.description,
                            tontine_id=tour.tontine_id,
                            tour_num=tour.numero_du_tour,
                        )
                    else:
                        spec = spec_cotisation_a_venir(
                            tontine_nom=tour.tontine.description,
                            tontine_id=tour.tontine_id,
                            tour_num=tour.numero_du_tour,
                            echeance=tour.date_echeance,
                        )
                    spec = dataclasses.replace(spec, dedup_key=dedup_key)
                    items.append((tm.membre, spec))

        return NotificationService.bulk_emit_idempotent(items)
