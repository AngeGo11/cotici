"""Consultation des transactions wallet et forçage exceptionnel de leur
statut, depuis le back-office (`Perm.TX_READ` / `Perm.TX_FORCE_STATUS`).

Le forçage de statut est l'action la plus dangereuse exposée par ce module :
elle permet à un opérateur de faire passer une transaction bloquée
(`EN ATTENTE`) à un statut terminal sans repasser par le flux métier normal
(callback opérateur mobile money, validation applicative...). Pour limiter le
risque :

- seules les transitions `EN ATTENTE -> {RÉUSSIE, ÉCHOUÉE, ANNULÉE}` sont
  autorisées ; toute autre transition (y compris re-forcer une transaction
  déjà terminale) est refusée explicitement (`InvalidTransactionTransitionError`) ;
- l'opération est effectuée sous `transaction.atomic()` + `select_for_update()`
  pour éviter une course avec un callback concurrent qui modifierait le
  statut au même instant ;
- **le solde du wallet n'est JAMAIS recalculé ni corrigé ici.** Faire passer
  une transaction à RÉUSSIE ne crédite/débite pas le wallet : ce serait un
  ajustement de solde, qui relève exclusivement du module portefeuilles
  (`Perm.WALLET_ADJUST`, traité par un autre agent). Un opérateur qui force un
  statut RÉUSSIE doit, si nécessaire, ouvrir en complément un ajustement de
  solde explicite et motivé — jamais l'inverse.
"""
from __future__ import annotations

from datetime import datetime

from django.db import transaction as db_transaction
from django.db.models import Q, QuerySet

from apps.administration.domain.errors import InvalidTransactionTransitionError
from apps.wallet.models import Transaction

# Transitions défendables depuis le back-office : uniquement depuis l'état
# transitoire EN_ATTENTE vers un état terminal. Volontairement figé en dur
# (pas de configuration runtime) pour la même raison que `domain.roles` :
# toute évolution doit passer par une revue de code.
ALLOWED_FORCE_TARGET_STATUSES: frozenset[str] = frozenset(
    {
        Transaction.STATUT_TRANSACTION.REUSSIE,
        Transaction.STATUT_TRANSACTION.ECHOUEE,
        Transaction.STATUT_TRANSACTION.ANNULE,
    }
)


def base_queryset() -> QuerySet[Transaction]:
    """QuerySet de base (non filtré), avec les `select_related` nécessaires
    pour éviter le N+1 sur le wallet et son titulaire, utilisé par la liste
    comme par la consultation détaillée d'une transaction."""
    return Transaction.objects.select_related("wallet", "wallet__user")


def list_transactions(
    *,
    statut: str | None = None,
    type_transaction: str | None = None,
    mode_de_paiement: str | None = None,
    date_from: datetime | None = None,
    date_to: datetime | None = None,
    search: str | None = None,
) -> QuerySet[Transaction]:
    """Liste filtrée des transactions, triée par date décroissante (les plus
    récentes en premier) : c'est l'ordre attendu par défaut du back-office."""
    qs = base_queryset()

    if statut:
        qs = qs.filter(statut_transaction=statut)
    if type_transaction:
        qs = qs.filter(type_transaction=type_transaction)
    if mode_de_paiement:
        qs = qs.filter(mode_de_paiement=mode_de_paiement)
    if date_from:
        qs = qs.filter(date_transaction__gte=date_from)
    if date_to:
        qs = qs.filter(date_transaction__lte=date_to)
    if search:
        qs = qs.filter(
            Q(ref_transaction__icontains=search)
            | Q(client_ref__icontains=search)
            | Q(wallet__user__numero_telephone__icontains=search)
            | Q(wallet__user__username__icontains=search)
            | Q(wallet__user__first_name__icontains=search)
            | Q(wallet__user__last_name__icontains=search)
        )

    return qs.order_by("-date_transaction")


@db_transaction.atomic
def force_status(*, transaction_id: int, new_status: str) -> Transaction:
    """Force le statut d'une transaction `EN ATTENTE` vers un statut terminal
    autorisé (voir `ALLOWED_FORCE_TARGET_STATUSES`).

    Verrouille la ligne (`select_for_update`) avant de relire son statut
    courant : protège contre une course avec un callback concurrent
    (opérateur mobile money, validation applicative) qui modifierait le
    statut entre la lecture faite par la vue (`get_object`) et cette écriture.

    Ne touche à AUCUN autre champ (montant, wallet, solde_courant...) : voir
    la limite documentée en tête de module.
    """
    tx = Transaction.objects.select_for_update().select_related("wallet", "wallet__user").get(
        pk=transaction_id
    )

    if tx.statut_transaction != Transaction.STATUT_TRANSACTION.EN_ATTENTE:
        raise InvalidTransactionTransitionError(
            "Seule une transaction EN ATTENTE peut être forcée "
            f"(statut actuel : {tx.get_statut_transaction_display()})."
        )
    if new_status not in ALLOWED_FORCE_TARGET_STATUSES:
        raise InvalidTransactionTransitionError(
            f"Statut cible non autorisé pour un forçage : {new_status!r}."
        )

    tx.statut_transaction = new_status
    tx.save(update_fields=["statut_transaction"])
    return tx
