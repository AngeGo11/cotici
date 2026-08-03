"""Consultation des épargnes personnelles depuis le back-office
(`GET /api/admin/savings/`, `Perm.WALLET_READ`).

Module **strictement en lecture** : aucune écriture n'est exposée (voir
`api/views/savings.py`). Le "cumul versé" affiché n'est jamais lu depuis le
champ `EpargnePersonnelle.montant_courant` (maintenu par l'application
métier, hors périmètre de cet agent) mais recalculé ici par agrégation SQL
sur les seules `Transaction` `RÉUSSIE` liées à l'épargne — cohérent avec la
règle du dashboard (`metrics_service.dashboard_stats`) : une transaction en
attente ou échouée n'a déplacé aucun franc.
"""
from __future__ import annotations

from decimal import Decimal

from django.db.models import DecimalField, F, Prefetch, Q, QuerySet, Sum
from django.db.models.functions import Coalesce

from apps.savings.models import EpargnePersonnelle
from apps.wallet.models import Transaction

#: États valides du filtre `etat` (liste blanche : jamais de filtre construit
#: depuis une valeur de requête non validée).
VALID_ETATS: frozenset[str] = frozenset(choice for choice, _ in EpargnePersonnelle.ETAT.choices)

_AMOUNT_FIELD = DecimalField(max_digits=10, decimal_places=0)


def _annotated_queryset() -> QuerySet[EpargnePersonnelle]:
    """QuerySet de base : titulaire préchargé (`select_related`) et cumul
    versé/retiré agrégés en base (`annotate`), jamais recalculés en boucle
    Python — voir docstring du module."""
    versements_reussis = Q(
        transaction__type_transaction=Transaction.TYPE_TRANSACTION.VERSEMENT_EPARGNE_PERSONNELLE,
        transaction__statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
    )
    retraits_reussis = Q(
        transaction__type_transaction=Transaction.TYPE_TRANSACTION.RETRAIT_EPARGNE_PERSONNELLE,
        transaction__statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
    )

    qs = EpargnePersonnelle.objects.select_related("hote").annotate(
        total_verse=Coalesce(
            Sum("transaction__montant_transaction", filter=versements_reussis),
            Decimal("0"),
            output_field=_AMOUNT_FIELD,
        ),
        total_retire=Coalesce(
            Sum("transaction__montant_transaction", filter=retraits_reussis),
            Decimal("0"),
            output_field=_AMOUNT_FIELD,
        ),
    )
    return qs.annotate(cumul_verse=F("total_verse") - F("total_retire"))


def list_savings_queryset(*, search: str = "", etat: str = "") -> QuerySet[EpargnePersonnelle]:
    """Liste des épargnes personnelles, triée par date de création
    décroissante (les plus récentes en premier).

    - `search` filtre sur le titulaire (nom, prénom, identifiant, téléphone)
      ou le libellé du projet.
    - `etat` filtre sur `EpargnePersonnelle.ETAT` (liste blanche
      `VALID_ETATS` : une valeur inconnue est silencieusement ignorée plutôt
      que de lever une erreur, pour rester tolérant à un paramètre de
      requête mal formé).
    """
    qs = _annotated_queryset()

    search = (search or "").strip()
    if search:
        qs = qs.filter(
            Q(nom_projet__icontains=search)
            | Q(hote__username__icontains=search)
            | Q(hote__first_name__icontains=search)
            | Q(hote__last_name__icontains=search)
            | Q(hote__numero_telephone__icontains=search)
        )

    etat = (etat or "").strip().upper()
    if etat in VALID_ETATS:
        qs = qs.filter(etat=etat)

    return qs.order_by("-date_creation", "-pk")


def get_savings_detail_queryset() -> QuerySet[EpargnePersonnelle]:
    """QuerySet utilisé par `retrieve` : mêmes annotations que la liste,
    enrichies de l'historique complet des versements/retraits (préchargé via
    `Prefetch` pour éviter un N+1 lors de la sérialisation)."""
    historique = Transaction.objects.order_by("-date_transaction")
    return _annotated_queryset().prefetch_related(
        Prefetch("transaction_set", queryset=historique, to_attr="historique_transactions")
    )
