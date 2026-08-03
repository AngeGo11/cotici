"""Constate puis recouvre automatiquement les pénalités de retard de tontine.

Suit le pattern imposé par `apps/notifications/management/commands/_job_utils.py`
(`job_lock` + `job_run`) et s'inspire de `notify_tour_overdue.py` pour les
lectures groupées. **Toute écriture financière passe exclusivement par
`apps.tontine.services.penalties_service`** (source de vérité unique du
débit) : cette command ne fait jamais elle-même de `wallet.solde_courant -= ...`.

Deux phases indépendantes (option `--phase`) :

- **constat** : détecte, parmi les tours EN_COURS à échéance dépassée des
  tontines ayant activé `penalites_automatiques`, le payeur courant en retard
  et lui constate une pénalité (`constater_penalite`). Lectures groupées par
  lots de 200 tours, puis UNE transaction courte par pénalité effectivement
  créée — jamais de transaction englobant tout le lot (elle retiendrait des
  centaines de verrous `Wallet`/`TourTontine` et bloquerait les cotisations
  concurrentes).
- **recouvrement** : tente le prélèvement des dettes automatiques impayées non
  annulées, par ordre FIFO d'attribution (`.iterator(chunk_size=500)`), une
  `atomic()` par dette (`tenter_prelevement`). Anti-thrashing : saute toute
  pénalité dont `date_derniere_tentative` a moins de 6h.

`--dry-run` n'effectue AUCUNE écriture (ni pénalité créée, ni wallet débité) :
il affiche uniquement le chiffrage estimé, via une réplique en lecture seule
de la logique de `apps.tontine.penalties` (module pur) — volontairement
distincte du chemin d'écriture réel, pour ne jamais risquer qu'un `--dry-run`
laisse fuiter un effet de bord via un rollback mal maîtrisé d'un `atomic()`
imbriqué (notifications, heartbeat `JobRun`...).

Cron recommandé : `20 * * * *` (horaire — le délai de grâce est exprimé en
heures, une cadence quotidienne le respecterait trop approximativement ;
minute 20 pour ne pas concourir avec `notify_tour_overdue` à la minute 0). Voir
`DEPLOYMENT.md`.
"""
from __future__ import annotations

from collections import defaultdict
from datetime import timedelta

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import IntegrityError
from django.utils import timezone

from apps.notifications.management.commands._job_utils import job_lock, job_run
from apps.tontine.helpers import active_members_ordered
from apps.tontine.models import Penalite, Tontine, TontineRegle, TourTontine
from apps.tontine.penalties import est_en_retard, penalites_auto_actives
from apps.tontine.scheduling import tour_echeance
from apps.tontine.services.penalties_service import (
    PenaliteDejaTraiteeError,
    StatutPrelevement,
    constater_penalite,
    tenter_prelevement,
)
from apps.wallet.models import Transaction

_BATCH_CONSTAT = 200
_CHUNK_RECOUVREMENT = 500
_ANTI_THRASHING_DELTA = timedelta(hours=6)


class Command(BaseCommand):
    help = (
        "Constate puis recouvre automatiquement les pénalités de retard de tontine "
        "(tontines ayant explicitement activé penalites_automatiques)."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="N'écrit rien : affiche uniquement le chiffrage estimé.",
        )
        parser.add_argument("--tontine-id", type=int, default=None)
        parser.add_argument(
            "--limit", type=int, default=5000, help="Nombre maximum d'unités traitées par phase."
        )
        parser.add_argument(
            "--phase",
            choices=["constat", "recouvrement", "all"],
            default="all",
        )

    def handle(self, *args, **options):
        job_name = "apply_tontine_penalties"
        dry_run = options["dry_run"]

        if dry_run:
            # Pas de job_lock/job_run en dry-run : c'est une simulation de
            # diagnostic, pas une exécution réelle du job planifié — elle ne
            # doit ni concourir avec une vraie exécution en cours (elle ne
            # verrouille pas), ni polluer le heartbeat `JobRun`.
            self._run(options, dry_run=True)
            return

        with job_lock(job_name) as acquired:
            if not acquired:
                self.stdout.write(
                    self.style.WARNING(f"{job_name} : une instance tourne déjà, sortie.")
                )
                return
            with job_run(job_name):
                self._run(options, dry_run=False)

    # ------------------------------------------------------------------
    # Orchestration
    # ------------------------------------------------------------------

    def _run(self, options, *, dry_run: bool) -> None:
        phase = options["phase"]
        tontine_id = options.get("tontine_id")
        limit = options["limit"]

        if phase in ("constat", "all"):
            stats = (
                self._dry_run_constat(tontine_id, limit)
                if dry_run
                else self._phase_constat(tontine_id, limit)
            )
            self._report("Constat", stats)

        if phase in ("recouvrement", "all"):
            stats = (
                self._dry_run_recouvrement(tontine_id, limit)
                if dry_run
                else self._phase_recouvrement(tontine_id, limit)
            )
            self._report("Recouvrement", stats)

    def _report(self, label: str, stats: dict) -> None:
        detail = ", ".join(f"{k}={v}" for k, v in stats.items())
        self.stdout.write(self.style.SUCCESS(f"{label} : {detail}"))

    # ------------------------------------------------------------------
    # Phase 1 — constat (écriture réelle)
    # ------------------------------------------------------------------

    def _phase_constat(self, tontine_id, limit: int) -> dict:
        """PAIEMENT LIBRE : constate une pénalité pour CHAQUE membre actif en
        retard sur un tour (et non plus uniquement le "payeur courant" — cette
        notion a disparu avec l'abandon du séquencement des cotisations). Ce
        constat anticipé (avant la clôture forcée à échéance, voir
        `apps.tontine.services.cloture_service`) reste soumis au délai de
        grâce ; `cloturer_tour` constate lui aussi les retardataires, sans
        délai de grâce (la clôture est un couperet), via
        `constater_penalite(..., ignorer_delai_grace=True)` — les deux
        chemins sont idempotents entre eux (contrainte DB
        `uniq_penalite_auto_par_tour_et_user`)."""
        now = timezone.now()
        created = 0
        skipped_divergence = 0
        errors = 0
        traites = 0

        for tour, regle in self._candidats_constat(tontine_id, limit):
            if traites >= limit:
                break
            traites += 1

            echeance_recalculee = tour_echeance(regle, tour)
            if echeance_recalculee != tour.date_echeance:
                # Cache `date_echeance` divergent : jamais de débit sur une
                # donnée incohérente. `recompute_echeances` répare ce cache.
                skipped_divergence += 1
                continue

            membres = active_members_ordered(tour.tontine)
            debit_ids = set(
                Transaction.objects.filter(
                    tour=tour,
                    tontine=tour.tontine,
                    type_transaction=Transaction.TYPE_TRANSACTION.DEBIT,
                    statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
                ).values_list("wallet__user_id", flat=True)
            )
            fautifs = [tm for tm in membres if tm.membre_id not in debit_ids]

            for fautif in fautifs:
                try:
                    penalite = constater_penalite(tour, fautif.membre, regle, now=now)
                except IntegrityError:
                    errors += 1
                    continue

                if penalite is not None:
                    created += 1

        return {
            "tours_examines": traites,
            "penalites_creees": created,
            "echeances_divergentes_ignorees": skipped_divergence,
            "erreurs": errors,
        }

    def _candidats_constat(self, tontine_id, limit: int):
        """Générateur de `(tour, regle)` candidats au constat, par lots de 200."""
        qs = (
            TourTontine.objects.filter(
                statut_tour=TourTontine.STATUT_TOUR.EN_COURS,
                date_echeance__isnull=False,
                date_echeance__lte=timezone.now(),
                tontine__etat=Tontine.ETAT.ACTIF,
                tontine__tontineregle__penalites_automatiques=True,
                tontine__tontineregle__montant_penalite__gt=0,
            )
            .select_related("tontine", "tontine__tontineregle")
            .order_by("id")
        )
        if tontine_id is not None:
            qs = qs.filter(tontine_id=tontine_id)

        seen = 0
        for tour in qs.iterator(chunk_size=_BATCH_CONSTAT):
            if seen >= limit:
                return
            seen += 1
            try:
                regle = tour.tontine.tontineregle
            except TontineRegle.DoesNotExist:
                continue
            yield tour, regle

    # ------------------------------------------------------------------
    # Phase 2 — recouvrement (écriture réelle)
    # ------------------------------------------------------------------

    def _phase_recouvrement(self, tontine_id, limit: int) -> dict:
        now = timezone.now()
        seuil_thrashing = now - _ANTI_THRASHING_DELTA

        qs = Penalite.objects.filter(
            est_automatique=True,
            est_reglee=False,
            est_annulee=False,
            tour__isnull=False,
        ).order_by("date_attribution_penalite")
        if tontine_id is not None:
            qs = qs.filter(tontine_id=tontine_id)

        reglees = 0
        insuffisant = 0
        skipped_thrashing = 0
        errors = 0
        traites = 0

        for penalite in qs.select_related("tour", "user").iterator(chunk_size=_CHUNK_RECOUVREMENT):
            if traites >= limit:
                break
            if (
                penalite.date_derniere_tentative is not None
                and penalite.date_derniere_tentative > seuil_thrashing
            ):
                skipped_thrashing += 1
                continue
            traites += 1

            try:
                resultat = tenter_prelevement(penalite, now=now)
            except PenaliteDejaTraiteeError:
                continue
            except IntegrityError:
                errors += 1
                continue

            if resultat.statut == StatutPrelevement.REGLEE:
                reglees += 1
            elif resultat.statut == StatutPrelevement.SOLDE_INSUFFISANT:
                insuffisant += 1

        return {
            "dettes_examinees": traites,
            "reglees": reglees,
            "solde_insuffisant": insuffisant,
            "ignorees_anti_thrashing": skipped_thrashing,
            "erreurs": errors,
        }

    # ------------------------------------------------------------------
    # Estimation --dry-run (lecture seule, aucune écriture)
    # ------------------------------------------------------------------

    def _dry_run_constat(self, tontine_id, limit: int) -> dict:
        now = timezone.now()
        estimees = 0
        skipped_divergence = 0
        traites = 0

        for tour, regle in self._candidats_constat(tontine_id, limit):
            traites += 1
            echeance_recalculee = tour_echeance(regle, tour)
            if echeance_recalculee != tour.date_echeance:
                skipped_divergence += 1
                continue

            if not est_en_retard(regle, tour, now):
                continue

            membres = active_members_ordered(tour.tontine)
            debit_ids = set(
                Transaction.objects.filter(
                    tour=tour,
                    tontine=tour.tontine,
                    type_transaction=Transaction.TYPE_TRANSACTION.DEBIT,
                    statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
                ).values_list("wallet__user_id", flat=True)
            )
            fautifs = [tm for tm in membres if tm.membre_id not in debit_ids]
            deja_constates = set(
                Penalite.objects.filter(
                    tour=tour, est_automatique=True, user_id__in=[tm.membre_id for tm in fautifs]
                ).values_list("user_id", flat=True)
            )
            estimees += sum(1 for tm in fautifs if tm.membre_id not in deja_constates)

        return {
            "tours_examines": traites,
            "penalites_estimees": estimees,
            "echeances_divergentes_ignorees": skipped_divergence,
        }

    def _dry_run_recouvrement(self, tontine_id, limit: int) -> dict:
        now = timezone.now()
        seuil_thrashing = now - _ANTI_THRASHING_DELTA

        qs = Penalite.objects.filter(
            est_automatique=True,
            est_reglee=False,
            est_annulee=False,
            tour__isnull=False,
        ).select_related("tour", "tour__tontine", "tour__tontine__tontineregle", "user")
        if tontine_id is not None:
            qs = qs.filter(tontine_id=tontine_id)

        eligibles = 0
        skipped_thrashing = 0
        traites = 0

        for penalite in qs.order_by("date_attribution_penalite")[:limit]:
            traites += 1
            if (
                penalite.date_derniere_tentative is not None
                and penalite.date_derniere_tentative > seuil_thrashing
            ):
                skipped_thrashing += 1
                continue
            eligibles += 1

        return {
            "dettes_examinees": traites,
            "dettes_eligibles_estimees": eligibles,
            "ignorees_anti_thrashing": skipped_thrashing,
        }
