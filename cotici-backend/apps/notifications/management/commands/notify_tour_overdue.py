"""Envoie les alertes de retard de cotisation (après échéance), plafonnées.

Cadence recommandée : quotidienne, tôt le matin (ex. 08h locale Abidjan =
08h UTC, cf. `config/settings.py::TIME_ZONE = "UTC"`).

Limite connue (à documenter, cf. `DEPLOYMENT.md`) : le premier palier de
retard JOURNALIER (3h après échéance, voir
`apps.tontine.scheduling.retard_offsets`) suppose une cadence plus fine
qu'une fois par jour pour respecter ce délai à la minute près. Si des
tontines JOURNALIER sont utilisées en production, planifier cette command
plus fréquemment (ex. horaire) — elle reste idempotente (dedup_key par jour
calendaire local) donc sûre à ré-exécuter souvent.

Plafond anti-harcèlement : au plus `apps.tontine.scheduling.MAX_RETARD_RELANCES`
(2) alertes de retard par (tour, utilisateur), quelle que soit la fréquence.
"""
from __future__ import annotations

import dataclasses
from collections import Counter, defaultdict

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.notifications.domain.catalog import spec_cotisation_retard
from apps.notifications.domain.dedup import dedup_cotisation_retard
from apps.notifications.management.commands._job_utils import job_lock, job_run
from apps.notifications.models import Notifications
from apps.notifications.services.notification_service import NotificationService
from apps.tontine.models import TontineMembre, TontineRegle, TourTontine
from apps.tontine.scheduling import MAX_RETARD_RELANCES, retard_offsets
from apps.wallet.models import Transaction

_DEDUP_PREFIX = "v1:tontine:cotisation.retard:"


def _parse_retard_dedup_key(key: str) -> tuple[int, int] | None:
    """Extrait `(tour_id, user_id)` d'un dedup_key de retard, ou None si malformé."""
    parts = key.split(":")
    if len(parts) < 5:
        return None
    try:
        tour_id = int(parts[3].split("=", 1)[1])
        user_id = int(parts[4].split("=", 1)[1])
    except (IndexError, ValueError):
        return None
    return tour_id, user_id


class Command(BaseCommand):
    help = (
        "Envoie une alerte de retard de cotisation (idempotente, plafonnée à "
        f"{MAX_RETARD_RELANCES} relances) aux membres n'ayant pas cotisé après "
        "l'échéance de leur tour. Destinée à être planifiée quotidiennement."
    )

    def handle(self, *args, **options):
        job_name = "notify_tour_overdue"
        with job_lock(job_name) as acquired:
            if not acquired:
                self.stdout.write(
                    self.style.WARNING(f"{job_name} : une instance tourne déjà, sortie.")
                )
                return
            with job_run(job_name):
                sent = self._run()
        self.stdout.write(self.style.SUCCESS(f"{sent} alerte(s) de retard émise(s) (idempotent)."))

    def _run(self) -> int:
        now = timezone.now()

        tours = list(
            TourTontine.objects.filter(
                statut_tour=TourTontine.STATUT_TOUR.EN_COURS,
                date_echeance__isnull=False,
                date_echeance__lte=now,
            ).select_related("tontine", "tontine__tontineregle")
        )
        if not tours:
            return 0

        tontine_ids = {t.tontine_id for t in tours}
        tour_ids = [t.id for t in tours]

        membres_by_tontine: dict[int, list[TontineMembre]] = defaultdict(list)
        for tm in TontineMembre.objects.filter(
            tontine_id__in=tontine_ids,
            statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
        ).select_related("membre"):
            membres_by_tontine[tm.tontine_id].append(tm)

        paid_by_tour: dict[int, set[int]] = defaultdict(set)
        for tour_id, user_id in Transaction.objects.filter(
            tour_id__in=tour_ids,
            type_transaction=Transaction.TYPE_TRANSACTION.DEBIT,
            statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
        ).values_list("tour_id", "wallet__user_id"):
            paid_by_tour[tour_id].add(user_id)

        # Compte des relances déjà envoyées par (tour, user), reconstruit à
        # partir du dedup_key plutôt que d'un champ dédié : une seule requête,
        # cohérent avec le fait que `Notifications` reste le journal source
        # de vérité (pas de compteur dupliqué à maintenir en écriture).
        already_sent: Counter[tuple[int, int]] = Counter()
        for key in Notifications.objects.filter(
            dedup_key__startswith=_DEDUP_PREFIX, source_id__in=tontine_ids
        ).values_list("dedup_key", flat=True):
            parsed = _parse_retard_dedup_key(key)
            if parsed is not None:
                already_sent[parsed] += 1

        items: list[tuple] = []
        for tour in tours:
            try:
                regle = tour.tontine.tontineregle
            except TontineRegle.DoesNotExist:
                continue

            offsets = retard_offsets(regle)
            if not offsets:
                continue

            paid_ids = paid_by_tour.get(tour.id, set())
            for tm in membres_by_tontine.get(tour.tontine_id, []):
                if tm.membre_id in paid_ids:
                    continue

                count = already_sent.get((tour.id, tm.membre_id), 0)
                if count >= MAX_RETARD_RELANCES or count >= len(offsets):
                    continue

                target_offset = offsets[count]
                if now < tour.date_echeance + target_offset:
                    continue

                dedup_key = dedup_cotisation_retard(
                    tour_id=tour.id, user_id=tm.membre_id, local_date=now.date()
                )
                spec = spec_cotisation_retard(
                    tontine_nom=tour.tontine.description,
                    tontine_id=tour.tontine_id,
                    tour_num=tour.numero_du_tour,
                )
                spec = dataclasses.replace(spec, dedup_key=dedup_key)
                items.append((tm.membre, spec))

        return NotificationService.bulk_emit_idempotent(items)
