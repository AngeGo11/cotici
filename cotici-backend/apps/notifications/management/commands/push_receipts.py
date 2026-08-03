"""Vérifie les receipts Expo Push pour finaliser le statut des envois `SENDING`.

Un ticket Expo "ok" (retourné par `send_push_messages`) ne signifie pas que le
message a été livré : il faut interroger `getPushNotificationReceipts` (ici
quelques minutes après l'envoi, une fois qu'Expo a eu le temps de contacter
APNs/FCM) pour connaître l'issue réelle. C'est cette command qui fait
progresser une entrée `SENDING` vers `SENT` (receipt "ok") ou vers un nouveau
cycle de retry / `DROPPED` (receipt en erreur).

Cadence recommandée : toutes les 15 minutes (cron). Verrouillée par
`pg_try_advisory_lock` comme les autres jobs de cette app.
"""
from __future__ import annotations

import logging
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone

from apps.notifications.management.commands._job_utils import job_lock, job_run
from apps.notifications.models import PushOutbox
from apps.notifications.push.backoff import MAX_ATTEMPTS, backoff_minutes
from apps.notifications.push.expo import (
    MAX_RECEIPT_IDS_PER_BATCH,
    ExpoPushError,
    chunk,
    get_push_receipts,
)

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = (
        "Interroge les receipts Expo Push pour les entrées PushOutbox en attente de "
        "confirmation (SENDING avec ticket_id), et finalise leur statut (SENT/retry/DROPPED). "
        "Destinée à être planifiée toutes les 15 minutes via un cron système externe."
    )

    def add_arguments(self, parser):
        parser.add_argument("--batch-size", type=int, default=1500)

    def handle(self, *args, **options):
        job_name = "push_receipts"
        with job_lock(job_name) as acquired:
            if not acquired:
                self.stdout.write(
                    self.style.WARNING(f"{job_name} : une instance tourne déjà, sortie.")
                )
                return
            with job_run(job_name):
                confirmed, retried = self._run(options["batch_size"])
        self.stdout.write(
            self.style.SUCCESS(f"{confirmed} receipt(s) confirmé(s), {retried} en erreur.")
        )

    def _run(self, batch_size: int) -> tuple[int, int]:
        now = timezone.now()

        entries = list(
            PushOutbox.objects.filter(
                statut=PushOutbox.Statut.SENDING,
                receipt_checked_at__isnull=True,
            )
            .exclude(ticket_id="")
            .order_by("updated_at")[:batch_size]
        )
        if not entries:
            return 0, 0

        by_ticket = {e.ticket_id: e for e in entries}
        confirmed = retried = 0

        for ticket_batch in chunk(list(by_ticket.keys()), MAX_RECEIPT_IDS_PER_BATCH):
            try:
                receipts = get_push_receipts(ticket_batch)
            except ExpoPushError:
                logger.exception("Échec réseau/HTTP de la vérification des receipts Expo.")
                continue

            for ticket_id in ticket_batch:
                entry = by_ticket.get(ticket_id)
                receipt = receipts.get(ticket_id)
                if entry is None or receipt is None:
                    continue

                if receipt.get("status") == "ok":
                    entry.statut = PushOutbox.Statut.SENT
                    entry.receipt_checked_at = now
                    entry.save(update_fields=["statut", "receipt_checked_at", "updated_at"])
                    confirmed += 1
                    continue

                error = (receipt.get("details") or {}).get("error", "")
                entry.error_code = error or "unknown"
                entry.receipt_checked_at = now
                if error == "DeviceNotRegistered":
                    entry.statut = PushOutbox.Statut.DROPPED
                    entry.save(
                        update_fields=["statut", "error_code", "receipt_checked_at", "updated_at"]
                    )
                else:
                    entry.attempts = entry.attempts + 1
                    if entry.attempts >= MAX_ATTEMPTS:
                        entry.statut = PushOutbox.Statut.FAILED
                    else:
                        entry.statut = PushOutbox.Statut.QUEUED
                        entry.next_attempt_at = now + timedelta(
                            minutes=backoff_minutes(entry.attempts)
                        )
                    entry.save(
                        update_fields=[
                            "statut",
                            "attempts",
                            "next_attempt_at",
                            "error_code",
                            "receipt_checked_at",
                            "updated_at",
                        ]
                    )
                retried += 1

        return confirmed, retried
