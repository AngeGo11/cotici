"""Logique métier du back-office pour le domaine `apps.disputes`.

Consultation (file priorisée par ancienneté) et résolution des litiges. La
résolution est une transition d'état strictement bornée par
`Dispute.OPEN_STATUSES`/`Dispute.TERMINAL_STATUSES` : impossible de
re-résoudre un litige déjà tranché.

RAPPEL DE PÉRIMÈTRE (voir aussi `apps.disputes.models.Dispute`) : ce service
ne touche JAMAIS aux soldes wallet ni aux transactions. Un remboursement
consécutif à un litige gagné par le client est une opération distincte,
réalisée par le module `apps.wallet` (ajustement de solde), pas ici.
"""
from __future__ import annotations

from django.db import transaction
from django.db.models import Q, QuerySet
from django.utils import timezone

from apps.disputes.models import Dispute


class InvalidDisputeTransitionError(Exception):
    """Levée lorsqu'on tente de résoudre un litige déjà dans un état terminal."""


class InvalidResolutionOutcomeError(Exception):
    """Levée lorsque le statut cible demandé n'est pas une issue de résolution valide."""


#: Statuts cibles acceptés par `resolve_dispute` (issues terminales possibles).
RESOLUTION_OUTCOMES = (Dispute.Status.RESOLVED, Dispute.Status.REJECTED)


def list_disputes(*, search: str = "", status: str = "", category: str = "") -> QuerySet[Dispute]:
    """Queryset de la file des litiges.

    Tri par `opened_at` croissant (le plus ancien en premier — c'est l'ordre
    par défaut du modèle, voir `Dispute.Meta.ordering`) : un litige ouvert
    depuis longtemps doit remonter en tête, pas se noyer sous les nouveaux.
    `select_related` évite le N+1 sur les FK affichées en liste (ouvreur,
    résolveur, transaction/tontine liées).
    """
    qs = Dispute.objects.select_related(
        "opened_by", "resolved_by", "transaction", "tontine"
    )

    status = (status or "").strip()
    if status:
        qs = qs.filter(status=status)

    category = (category or "").strip()
    if category:
        qs = qs.filter(category=category)

    search = (search or "").strip()
    if search:
        qs = qs.filter(
            Q(subject__icontains=search)
            | Q(description__icontains=search)
            | Q(opened_by__username__icontains=search)
            | Q(opened_by__numero_telephone__icontains=search)
        )

    return qs


def get_dispute(dispute_id) -> Dispute:
    """Récupère un litige par id (404 via `DoesNotExist` géré par la vue DRF)."""
    return list_disputes().get(pk=dispute_id)


@transaction.atomic
def resolve_dispute(
    *, actor, dispute: Dispute, resolution: str, decision: str, reason: str
) -> tuple[Dispute, dict, dict]:
    """Tranche un litige (`RESOLVED` ou `REJECTED`).

    Verrouille la ligne (`select_for_update`) pour empêcher deux opérateurs
    de résoudre le même litige en même temps (double décision contradictoire
    sous course concurrente). Refuse toute transition depuis un état
    terminal (`Dispute.TERMINAL_STATUSES`) : un litige résolu/rejeté est
    définitivement clos par ce module (voir docstring du module).

    Retourne `(dispute, before, after)` pour permettre à la vue d'écrire
    l'entrée d'audit (before/after des champs d'état).
    """
    if resolution not in RESOLUTION_OUTCOMES:
        raise InvalidResolutionOutcomeError(f"Issue de résolution inconnue : {resolution!r}")

    locked = Dispute.objects.select_for_update().get(pk=dispute.pk)

    if locked.status not in Dispute.OPEN_STATUSES:
        raise InvalidDisputeTransitionError(
            f"Le litige #{locked.pk} est déjà '{locked.get_status_display()}' : "
            "impossible de le résoudre à nouveau."
        )

    before = {
        "status": locked.status,
        "resolved_at": locked.resolved_at.isoformat() if locked.resolved_at else None,
        "resolved_by_id": locked.resolved_by_id,
    }

    now = timezone.now()
    locked.status = resolution
    locked.decision = decision
    locked.resolution_reason = reason
    locked.resolved_at = now
    locked.resolved_by = actor
    locked.save(
        update_fields=["status", "decision", "resolution_reason", "resolved_at", "resolved_by"]
    )

    after = {
        "status": locked.status,
        "resolved_at": locked.resolved_at.isoformat(),
        "resolved_by_id": locked.resolved_by_id,
    }
    return locked, before, after
