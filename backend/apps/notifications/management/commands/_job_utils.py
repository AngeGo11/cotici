"""Utilitaires partagés par les management commands de notification.

`job_lock` fournit un verrou d'exclusion mutuelle inter-process via
`pg_try_advisory_lock` (PostgreSQL) : sans lui, un `push_dispatch` planifié
toutes les minutes mais qui met exceptionnellement 3 minutes à s'exécuter
(pic de charge, lenteur Expo) verrait une deuxième instance démarrer en
parallèle et redistribuer les MÊMES entrées d'outbox — doublons visibles côté
utilisateur. Le verrou est non-bloquant : si une instance tourne déjà, la
nouvelle sort immédiatement plutôt que de s'empiler en attente.

`JobRun` sert de heartbeat (voir `apps.notifications.models.JobRun`) : sans
lui, un cron cassé (crash, exception, verrou jamais relâché) est invisible
tant qu'un utilisateur ne se plaint pas de ne pas recevoir de notification.
"""
from __future__ import annotations

import contextlib
import logging
from typing import Iterator

from django.db import connection, transaction
from django.utils import timezone

from apps.notifications.models import JobRun

logger = logging.getLogger(__name__)

# Un identifiant 64 bits arbitraire mais stable par job, dérivé d'un hash
# simple du nom : évite d'avoir à maintenir une table de correspondance
# `job_name -> int` à la main.
def _advisory_lock_key(job_name: str) -> int:
    return int.from_bytes(job_name.encode("utf-8")[:8].ljust(8, b"\0"), "big", signed=True) & 0x7FFFFFFFFFFFFFFF


@contextlib.contextmanager
def job_lock(job_name: str) -> Iterator[bool]:
    """Context manager : `yield True` si le verrou est acquis, `yield False` sinon.

    Le verrou est détenu pour la durée de la transaction/session courante et
    relâché automatiquement à la fermeture de la connexion (ou explicitement
    via `pg_advisory_unlock`), ce qui évite tout risque de verrou orphelin en
    cas de crash brutal du process.
    """
    key = _advisory_lock_key(job_name)
    with connection.cursor() as cursor:
        cursor.execute("SELECT pg_try_advisory_lock(%s)", [key])
        acquired = bool(cursor.fetchone()[0])
    try:
        yield acquired
    finally:
        if acquired:
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_advisory_unlock(%s)", [key])


@contextlib.contextmanager
def job_run(job_name: str) -> Iterator[JobRun]:
    """Enregistre le heartbeat du job (`JobRun`) autour de son exécution.

    Marque `last_started_at` avant l'exécution, puis `last_success_at`/
    `runs_ok` en cas de succès ou `last_error`/`runs_failed` en cas
    d'exception (qui est ensuite relancée : c'est à l'appelant — le
    `Command.handle` — de décider d'afficher une erreur au terminal cron).
    """
    run, _ = JobRun.objects.get_or_create(job_name=job_name)
    run.last_started_at = timezone.now()
    run.save(update_fields=["last_started_at"])
    try:
        yield run
    except Exception as exc:
        run.last_error = str(exc)[:2000]
        run.runs_failed = run.runs_failed + 1
        run.save(update_fields=["last_error", "runs_failed"])
        raise
    else:
        run.last_success_at = timezone.now()
        run.runs_ok = run.runs_ok + 1
        run.save(update_fields=["last_success_at", "runs_ok"])
