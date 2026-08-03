"""Dépile `PushOutbox` et envoie les notifications push via l'API Expo.

Cadence recommandée : chaque minute (cron). Verrouillé par
`pg_try_advisory_lock` (voir `_job_utils.job_lock`) : sans ce verrou, une
exécution qui dépasse exceptionnellement une minute (pic de charge, lenteur
Expo) verrait une deuxième instance démarrer en parallèle et redistribuer les
MÊMES entrées — doublons visibles côté utilisateur.

Un statut "ok" côté `send_push_messages` (ticket Expo) ne garantit PAS la
livraison réelle — seul `push_receipts` (`getPushNotificationReceipts`)
confirme la remise effective. Cette command laisse donc les entrées réussies
en `SENDING` (pas `SENT`), à charge de `push_receipts` de les finaliser.
"""
from __future__ import annotations

import logging
from collections import defaultdict
from datetime import timedelta

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from apps.notifications.management.commands._job_utils import job_lock, job_run
from apps.notifications.models import PushDevice, PushOutbox
from apps.notifications.push.backoff import MAX_ATTEMPTS, backoff_minutes
from apps.notifications.push.expo import (
    MAX_MESSAGES_PER_SEND_BATCH,
    ExpoPushError,
    chunk,
    send_push_messages,
)

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = (
        "Dépile PushOutbox (QUEUED/FAILED dont next_attempt_at est échu) et envoie les "
        "notifications via l'API Expo Push, par lots de 100. Destinée à être planifiée "
        "toutes les minutes via un cron système externe."
    )

    def add_arguments(self, parser):
        parser.add_argument("--batch-size", type=int, default=500)

    def handle(self, *args, **options):
        job_name = "push_dispatch"
        with job_lock(job_name) as acquired:
            if not acquired:
                self.stdout.write(
                    self.style.WARNING(f"{job_name} : une instance tourne déjà, sortie.")
                )
                return
            with job_run(job_name):
                sent, failed, dropped = self._run(options["batch_size"])
        self.stdout.write(
            self.style.SUCCESS(
                f"{sent} ticket(s) envoyé(s), {failed} échec(s) (retry programmé), "
                f"{dropped} abandonné(s)."
            )
        )

    def _run(self, batch_size: int) -> tuple[int, int, int]:
        now = timezone.now()

        # Réservation atomique du lot (passe en SENDING) pour qu'une exécution
        # concurrente ne puisse pas retraiter les mêmes lignes, en plus du
        # verrou advisory (défense en profondeur).
        with transaction.atomic():
            entries = list(
                PushOutbox.objects.select_for_update(skip_locked=True)
                .filter(
                    statut__in=[PushOutbox.Statut.QUEUED, PushOutbox.Statut.FAILED],
                    next_attempt_at__lte=now,
                )
                .order_by("next_attempt_at")[:batch_size]
            )
            if not entries:
                return 0, 0, 0
            PushOutbox.objects.filter(id__in=[e.id for e in entries]).update(
                statut=PushOutbox.Statut.SENDING
            )

        user_ids = {e.destinataire_id for e in entries}
        devices_by_user: dict[int, list[PushDevice]] = defaultdict(list)
        for device in PushDevice.objects.filter(user_id__in=user_ids, is_active=True):
            devices_by_user[device.user_id].append(device)

        sent = failed = dropped = 0

        message_targets: list[tuple[PushOutbox, PushDevice]] = []
        for entry in entries:
            devices = devices_by_user.get(entry.destinataire_id, [])
            if not devices:
                entry.statut = PushOutbox.Statut.DROPPED
                entry.error_code = "no_active_device"
                entry.save(update_fields=["statut", "error_code", "updated_at"])
                dropped += 1
                continue
            for device in devices:
                message_targets.append((entry, device))

        for batch in chunk(message_targets, MAX_MESSAGES_PER_SEND_BATCH):
            messages = [
                {
                    "to": device.expo_token,
                    "title": entry.titre,
                    "body": entry.corps,
                    "data": entry.data,
                }
                for entry, device in batch
            ]
            try:
                tickets = send_push_messages(messages)
            except ExpoPushError:
                logger.exception("Échec réseau/HTTP d'un lot de %s push Expo.", len(messages))
                for entry, _device in batch:
                    self._retry_or_fail(entry, error_code="expo_send_error")
                    failed += 1
                continue

            for (entry, device), ticket in zip(batch, tickets):
                if ticket.get("status") == "ok":
                    entry.ticket_id = ticket.get("id", "")
                    entry.attempts = entry.attempts + 1
                    entry.save(update_fields=["ticket_id", "attempts", "updated_at"])
                    sent += 1
                    continue

                error = (ticket.get("details") or {}).get("error", "")
                if error == "DeviceNotRegistered":
                    device.is_active = False
                    device.last_error = error
                    device.save(update_fields=["is_active", "last_error", "updated_at"])
                    entry.statut = PushOutbox.Statut.DROPPED
                    entry.error_code = error
                    entry.save(update_fields=["statut", "error_code", "updated_at"])
                    dropped += 1
                    continue

                self._retry_or_fail(entry, error_code=error or "unknown")
                failed += 1

        return sent, failed, dropped

    def _retry_or_fail(self, entry: PushOutbox, *, error_code: str) -> None:
        """Backoff exponentiel (1, 5, 25 min) jusqu'à `MAX_ATTEMPTS`, puis FAILED définitif."""
        entry.attempts = entry.attempts + 1
        entry.error_code = error_code
        if entry.attempts >= MAX_ATTEMPTS:
            entry.statut = PushOutbox.Statut.FAILED
        else:
            entry.statut = PushOutbox.Statut.QUEUED
            entry.next_attempt_at = timezone.now() + timedelta(minutes=backoff_minutes(entry.attempts))
        entry.save(update_fields=["statut", "attempts", "next_attempt_at", "error_code", "updated_at"])
