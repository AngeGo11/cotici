"""Consultation et ajustement manuel des portefeuilles (`/api/admin/wallets/`).

Deux responsabilités :

- `list_wallets_queryset` : requête optimisée (select_related + annotate)
  utilisée par la liste et la fiche détail — évite tout N+1 sur l'écran
  `/portefeuilles` du back-office.
- `adjust_balance` : écriture financière (`Perm.WALLET_ADJUST`), sous
  `transaction.atomic()` + `select_for_update()` sur le `Wallet` ciblé,
  refusant tout ajustement qui rendrait le solde négatif. Voir la docstring
  de la fonction pour le choix de matérialisation de l'ajustement.
"""
from __future__ import annotations

from decimal import Decimal
from uuid import uuid4

from django.db import transaction
from django.db.models import Count, Q, QuerySet

from apps.administration.domain.errors import WalletInsufficientBalanceError
from apps.wallet.models import Transaction, Wallet


def list_wallets_queryset(*, search: str = "", ordering: str = "") -> QuerySet[Wallet]:
    """Queryset de base de l'écran `/portefeuilles` : titulaire préchargé
    (`select_related`) et nombre de transactions précalculé en base
    (`annotate`), pour éviter une requête N+1 par ligne affichée.
    """
    qs = Wallet.objects.select_related("user").annotate(
        transactions_count=Count("transaction")
    )

    search = (search or "").strip()
    if search:
        qs = qs.filter(
            Q(user__numero_telephone__icontains=search)
            | Q(user__username__icontains=search)
            | Q(user__first_name__icontains=search)
            | Q(user__last_name__icontains=search)
        )

    # Tri restreint à une liste blanche : jamais de tri sur une expression
    # arbitraire construite depuis un paramètre de requête non validé.
    allowed_ordering = {
        "solde_courant",
        "-solde_courant",
        "transactions_count",
        "-transactions_count",
        "user__date_joined",
        "-user__date_joined",
    }
    ordering = (ordering or "").strip()
    if ordering in allowed_ordering:
        qs = qs.order_by(ordering, "pk")
    else:
        qs = qs.order_by("-pk")
    return qs


def _unique_adjustment_ref() -> str:
    """Référence de transaction unique (max 25 caractères, contrainte du
    modèle), préfixée "ADJ" pour distinguer au premier coup d'œil un
    ajustement administratif d'un mouvement client (DEP/RET...)."""
    for _ in range(8):
        candidate = f"ADJ{uuid4().hex}"[:25]
        if not Transaction.objects.filter(ref_transaction=candidate).exists():
            return candidate
    return f"ADJ{uuid4().hex}"[:25]


@transaction.atomic
def adjust_balance(*, wallet_id: int, amount: Decimal, reason: str) -> dict:
    """Applique un ajustement manuel signé (`amount`) au solde du wallet
    `wallet_id` et matérialise l'opération par une `Transaction`.

    Choix de matérialisation (documenté ici car aucun type de transaction
    dédié à un "ajustement admin" n'existe, et l'énoncé interdit d'en créer
    un nouveau — cela impliquerait une migration sur `apps.wallet.models`
    concurrente au travail d'autres agents) :

    - On réutilise les types existants `DEPOT` (si `amount > 0`) et
      `RETRAIT` (si `amount < 0`). Dans la `CheckConstraint`
      `wallet_transaction_fk_coherence_type` de `Transaction`, ce sont les
      DEUX SEULS types qui ne référencent ni tontine, ni tour, ni épargne :
      c'est exactement la sémantique d'un ajustement administratif, qui est
      un mouvement de solde "brut", décorrélé de tout produit métier.
    - `mode_de_paiement=SOLDE_COTICI` : il ne s'agit pas d'un canal de
      paiement externe réel (Orange/MTN/Wave/Moov), mais d'un mouvement
      interne.
    - `statut_transaction=REUSSIE` : l'ajustement est appliqué
      atomiquement avec l'écriture de la transaction, il n'existe pas
      d'état intermédiaire "en attente".
    - Le fait qu'il s'agisse spécifiquement d'un ajustement *administratif*
      (par opposition à un dépôt/retrait initié par le client lui-même)
      n'est PAS visible depuis `Transaction` seule : c'est l'`AdminActionLog`
      écrit automatiquement par `AdminAuditTrailMiddleware` (action
      `WALLET_ADJUSTED`, acteur, motif obligatoire, solde avant/après) qui
      porte cette information, conformément à la consigne de ne pas
      modifier `apps.wallet.models`.

    Verrouille la ligne `Wallet` (`select_for_update`) pour la durée de la
    transaction DB, afin d'empêcher qu'un dépôt/retrait/cotisation concurrent
    ne lise un solde périmé pendant l'ajustement (race condition classique
    sur un solde partagé).

    Lève `WalletInsufficientBalanceError` si l'ajustement rendrait le solde
    négatif — jamais d'écriture partielle dans ce cas (tout se passe sous
    `transaction.atomic()`, y compris la levée de l'exception).
    """
    wallet = Wallet.objects.select_for_update().select_related("user").get(pk=wallet_id)
    before = wallet.solde_courant
    after = before + amount

    if after < 0:
        raise WalletInsufficientBalanceError(
            f"Ajustement refusé : le solde passerait de {before} à {after} (négatif)."
        )

    wallet.solde_courant = after
    wallet.save(update_fields=["solde_courant"])

    tx = Transaction.objects.create(
        wallet=wallet,
        solde_courant=after,
        ref_transaction=_unique_adjustment_ref(),
        mode_de_paiement=Transaction.MODE_DE_PAIEMENT.SOLDE_COTICI,
        montant_transaction=abs(amount),
        statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
        type_transaction=(
            Transaction.TYPE_TRANSACTION.DEPOT
            if amount > 0
            else Transaction.TYPE_TRANSACTION.RETRAIT
        ),
    )

    return {"wallet": wallet, "transaction": tx, "before": before, "after": after}
