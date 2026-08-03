"""Purge périodique des notifications et de l'outbox push, par lots.

Contrat de rétention (À NE JAMAIS RACCOURCIR sans relire ce commentaire) :
la rétention la plus courte ici (notifications LUES, 90 jours) doit TOUJOURS
dépasser largement la fenêtre du job le plus long qui s'appuie sur
`dedup_key` pour son idempotence — sans quoi purger une notification revient
à effacer la mémoire de son propre anti-doublon, et le prochain passage du
job (rappel ou relance de retard) la considère comme jamais envoyée et la
renvoie. La fenêtre la plus longue actuellement utilisée est celle des
relances de retard MENSUEL (échéance + jusqu'à 3 jours), très loin des 90
jours de marge ici — cette rétention a donc une marge confortable.

Cadence recommandée : hebdomadaire (cron), hors heures de pointe.
"""
from __future__ import annotations

from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db.models import QuerySet
from django.utils import timezone

from apps.notifications.management.commands._job_utils import job_lock, job_run
from apps.notifications.models import Notifications, PushOutbox

RETENTION_READ_DAYS = 90
RETENTION_ALL_DAYS = 365
RETENTION_OUTBOX_SENT_DAYS = 30
BATCH_SIZE = 5000


def _delete_in_batches(queryset: QuerySet, *, batch_size: int = BATCH_SIZE) -> int:
    """Supprime `queryset` par lots de `batch_size` lignes.

    Évite un unique DELETE massif qui verrouillerait la table trop longtemps
    et gonflerait le WAL d'un seul coup sur une base de production.
    """
    model = queryset.model
    total = 0
    while True:
        ids = list(queryset.values_list("id", flat=True)[:batch_size])
        if not ids:
            break
        model.objects.filter(id__in=ids).delete()
        total += len(ids)
    return total


class Command(BaseCommand):
    help = (
        "Purge les notifications lues depuis plus de 90 jours, toutes les notifications "
        "de plus de 365 jours (lues ou non), et les entrées PushOutbox SENT de plus de 30 "
        "jours, par lots de 5000. Destinée à être planifiée hebdomadairement."
    )

    def handle(self, *args, **options):
        job_name = "purge_notifications"
        with job_lock(job_name) as acquired:
            if not acquired:
                self.stdout.write(
                    self.style.WARNING(f"{job_name} : une instance tourne déjà, sortie.")
                )
                return
            with job_run(job_name):
                deleted_notifs, deleted_outbox = self._run()
        self.stdout.write(
            self.style.SUCCESS(
                f"{deleted_notifs} notification(s) purgée(s), "
                f"{deleted_outbox} entrée(s) PushOutbox purgée(s)."
            )
        )

    def _run(self) -> tuple[int, int]:
        now = timezone.now()
        read_cutoff = now - timedelta(days=RETENTION_READ_DAYS)
        all_cutoff = now - timedelta(days=RETENTION_ALL_DAYS)
        outbox_cutoff = now - timedelta(days=RETENTION_OUTBOX_SENT_DAYS)

        deleted_notifs = _delete_in_batches(
            Notifications.objects.filter(est_lue=True, date_lecture__lt=read_cutoff)
        )
        deleted_notifs += _delete_in_batches(
            Notifications.objects.filter(date_envoie__lt=all_cutoff)
        )
        deleted_outbox = _delete_in_batches(
            PushOutbox.objects.filter(
                statut=PushOutbox.Statut.SENT, updated_at__lt=outbox_cutoff
            )
        )
        return deleted_notifs, deleted_outbox
