"""Tâches Celery — WRAPPERS MINCES sur `apps.tontine.services.*`.

Aucune écriture financière n'a lieu ici : chaque tâche se contente de
sélectionner les candidats (lecture) puis de déléguer à un service qui gère
lui-même sa (ou ses) transaction(s) courte(s). Ceci préserve la testabilité
(les services se testent en pur Django, sans worker Celery ni Redis) et
laisse la porte ouverte à un déclenchement équivalent par `management
command`/cron (voir `apps/tontine/management/commands/cloturer_tours_echeance.py`,
qui appelle exactement les mêmes fonctions).

Idempotence & concurrence : chaque tâche est protégée par
`apps.notifications.management.commands._job_utils.job_lock` (verrou
`pg_try_advisory_lock`, déjà utilisé par les jobs de notification existants)
— une exécution qui chevaucherait la précédente (worker lent, retry Celery)
sort immédiatement sans dupliquer de travail. Le heartbeat `JobRun`
(`job_run`) est également réutilisé tel quel.
"""
from __future__ import annotations

import dataclasses
import logging
from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.utils import timezone

from apps.notifications.domain.catalog import (
    spec_cotisation_a_venir,
    spec_cotisation_jour_j,
    spec_cotisation_relance,
)
from apps.notifications.domain.dedup import dedup_cotisation_rappel, dedup_cotisation_relance
from apps.notifications.management.commands._job_utils import job_lock, job_run
from apps.notifications.services.notification_service import NotificationService
from apps.tontine.helpers import active_members_ordered, display_name, member_user_ids_paid_for_tour
from apps.tontine.models import DetteCotisation, Penalite, Tontine, TontineRegle, TourTontine
from apps.tontine.scheduling import cloture_cutoff, reminder_targets, retard_offsets
from apps.tontine.services.cloture_service import StatutCloture, cloturer_tour
from apps.tontine.services.recouvrement_service import regler_creances_membre

logger = logging.getLogger(__name__)


def _tours_actifs_avec_regle():
    return (
        TourTontine.objects.filter(
            statut_tour=TourTontine.STATUT_TOUR.EN_COURS,
            tontine__etat=Tontine.ETAT.ACTIF,
        )
        .select_related("tontine", "tontine__tontineregle")
        .order_by("id")
        .iterator(chunk_size=200)
    )


@shared_task(name="apps.tontine.tasks.tache_cloturer_tours_echeance")
def tache_cloturer_tours_echeance() -> dict:
    """Clôture tous les tours EN_COURS dont l'instant de clôture ("23h59"
    heure locale, voir `apps.tontine.scheduling.cloture_cutoff`) est dépassé.

    UNE `cloture_service.cloturer_tour()` — donc une `transaction.atomic()` —
    PAR TOUR, jamais une transaction englobant le lot entier (elle
    retiendrait potentiellement des centaines de verrous `Wallet`/`Tontine`/
    `TourTontine` et bloquerait les cotisations concurrentes). Idempotent :
    `cloturer_tour` re-vérifie sous verrou que le tour est toujours EN_COURS
    et ne fait rien s'il a déjà été clôturé par un passage précédent.
    """
    job_name = "tontine_cloturer_tours_echeance"
    with job_lock(job_name) as acquired:
        if not acquired:
            logger.info("%s: instance déjà en cours, sortie.", job_name)
            return {"skipped": True}
        with job_run(job_name):
            now = timezone.now()
            cloturees = 0
            deja_cloturees = 0
            impossibles = 0
            examines = 0

            for tour in _tours_actifs_avec_regle():
                try:
                    regle = tour.tontine.tontineregle
                except TontineRegle.DoesNotExist:
                    continue
                cutoff = cloture_cutoff(regle, tour)
                if cutoff is None or now < cutoff:
                    continue

                examines += 1
                resultat = cloturer_tour(tour.pk, now=now)
                if resultat.statut == StatutCloture.CLOTUREE:
                    cloturees += 1
                elif resultat.statut == StatutCloture.DEJA_CLOTUREE:
                    deja_cloturees += 1
                else:
                    impossibles += 1

            return {
                "tours_examines": examines,
                "tours_cloturees": cloturees,
                "deja_cloturees": deja_cloturees,
                "impossibles": impossibles,
            }


@shared_task(name="apps.tontine.tasks.tache_alertes_cotisation")
def tache_alertes_cotisation() -> dict:
    """Émet les alertes de cotisation à venir (règle 1), UN événement par
    (tour, membre non payeur, palier de rappel), idempotent via
    `dedup_cotisation_rappel` (déjà utilisée par le contrat de rétention
    documenté dans DEPLOYMENT.md)."""
    job_name = "tontine_alertes_cotisation"
    with job_lock(job_name) as acquired:
        if not acquired:
            return {"skipped": True}
        with job_run(job_name):
            now = timezone.now()
            envoyees = 0
            for tour in _tours_actifs_avec_regle():
                try:
                    regle = tour.tontine.tontineregle
                except TontineRegle.DoesNotExist:
                    continue
                targets = reminder_targets(regle, tour)
                if not targets:
                    continue
                paid_ids = member_user_ids_paid_for_tour(tour.tontine, tour)
                membres = [
                    tm for tm in active_members_ordered(tour.tontine) if tm.membre_id not in paid_ids
                ]
                for target in targets:
                    if not (target["window_start"] <= now <= target["window_end"]):
                        continue
                    for tm in membres:
                        spec = (
                            spec_cotisation_jour_j(
                                display_name(tour.tontine), tour.tontine_id, tour.numero_du_tour
                            )
                            if target["label"] == "J0"
                            else spec_cotisation_a_venir(
                                display_name(tour.tontine),
                                tour.tontine_id,
                                tour.numero_du_tour,
                                target["target_at"],
                            )
                        )
                        spec = dataclasses.replace(
                            spec,
                            dedup_key=dedup_cotisation_rappel(
                                tour_id=tour.pk, user_id=tm.membre_id, offset_label=target["label"]
                            ),
                        )
                        NotificationService.emit_idempotent(destinataire=tm.membre, spec=spec)
                        envoyees += 1
            return {"alertes_envoyees": envoyees}


@shared_task(name="apps.tontine.tasks.tache_relances_cotisation")
def tache_relances_cotisation() -> dict:
    """Émet les relances de retard (règle 1 : au plus `MAX_RETARD_RELANCES`,
    CHACUNE mentionnant explicitement le risque de pénalité, voir
    `spec_cotisation_relance`)."""
    job_name = "tontine_relances_cotisation"
    with job_lock(job_name) as acquired:
        if not acquired:
            return {"skipped": True}
        with job_run(job_name):
            now = timezone.now()
            envoyees = 0
            for tour in _tours_actifs_avec_regle():
                try:
                    regle = tour.tontine.tontineregle
                except TontineRegle.DoesNotExist:
                    continue
                if tour.date_echeance is None:
                    continue
                offsets = retard_offsets(regle)
                if not offsets:
                    continue
                paid_ids = member_user_ids_paid_for_tour(tour.tontine, tour)
                membres = [
                    tm for tm in active_members_ordered(tour.tontine) if tm.membre_id not in paid_ids
                ]
                montant_penalite = regle.montant_penalite if regle.montant_penalite > 0 else None
                for numero_relance, offset in enumerate(offsets, start=1):
                    target_at = tour.date_echeance + offset
                    # Fenêtre de rattrapage d'une heure (cadence horaire de la
                    # tâche) : évite de manquer la fenêtre si le worker est en
                    # retard d'un cycle.
                    if not (target_at <= now <= target_at + timedelta(hours=1)):
                        continue
                    for tm in membres:
                        spec = spec_cotisation_relance(
                            display_name(tour.tontine),
                            tour.tontine_id,
                            tour.numero_du_tour,
                            numero_relance,
                            montant_penalite,
                        )
                        spec = dataclasses.replace(
                            spec,
                            dedup_key=dedup_cotisation_relance(
                                tour_id=tour.pk, user_id=tm.membre_id, numero_relance=numero_relance
                            ),
                        )
                        NotificationService.emit_idempotent(destinataire=tm.membre, spec=spec)
                        envoyees += 1
            return {"relances_envoyees": envoyees}


@shared_task(name="apps.tontine.tasks.tache_recouvrement_creances")
def tache_recouvrement_creances() -> dict:
    """Recouvrement périodique de TOUTES les créances impayées (dettes de
    cotisation puis pénalités, voir `recouvrement_service.regler_creances_membre`),
    tontine par membre débiteur — sert aussi de filet de rattrapage pour la
    "compensation" du bénéficiaire d'une clôture récente (voir la docstring de
    `apps.tontine.services.cloture_service.cloturer_tour`)."""
    job_name = "tontine_recouvrement_creances"
    with job_lock(job_name) as acquired:
        if not acquired:
            return {"skipped": True}
        with job_run(job_name):
            now = timezone.now()
            couples = set(
                DetteCotisation.objects.filter(est_reglee=False, est_annulee=False).values_list(
                    "tontine_id", "debiteur_id"
                )
            ) | set(
                Penalite.objects.filter(
                    est_reglee=False, est_annulee=False, tour__isnull=False
                ).values_list("tontine_id", "user_id")
            )
            total = {"dettes_reglees": 0, "penalites_reglees": 0, "membres_traites": 0}
            for tontine_id, user_id in couples:
                r = regler_creances_membre(tontine_id, user_id, now=now)
                total["dettes_reglees"] += r.dettes_reglees
                total["penalites_reglees"] += r.penalites_reglees
                total["membres_traites"] += 1
            return total
