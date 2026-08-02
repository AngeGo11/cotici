"""Consultation des tontines solidaires depuis le back-office.

Périmètre strict : `Solidarity` (`apps.solidarity.models.Solidarity`) hérite
de `Tontine` en héritage multi-table, comme `Cagnotte` et les tontines de
groupe (même table de base `tontine_tontine`) — interroger directement
`Solidarity.objects` (et non `Tontine.objects.filter(type_tontine=...)`)
suffit ici à écarter cagnottes et tontines de groupe, puisque `Solidarity`
ne référence, via sa jointure implicite sur `tontine_ptr`, que les lignes
effectivement créées comme tontines solidaires.

Deux agrégats sont calculés en SQL (`annotate` + `Sum` conditionnel), jamais
en itérant en Python sur les transactions :

- `montant_collecte` : somme des `Transaction` de type
  `CONTRIBUTION_SOLIDAIRE` au statut `RÉUSSIE` rattachées à la collecte.
- `montant_verse` : somme des `Transaction` de type `VERSEMENT_SOLIDAIRE`
  (au statut `RÉUSSIE`) UNIQUEMENT. Piège documenté dans
  `apps.solidarity.views.verser_beneficiaire` : le versement crée DEUX
  transactions au même montant (`collecte`) — `VERSEMENT_SOLIDAIRE` (crédit
  effectif du wallet du bénéficiaire) et `VALIDATION_VERSEMENT_SOLIDAIRE`
  (simple trace de validation côté organisateur, qui ne crédite aucun
  wallet). Sommer les deux types doublerait artificiellement le montant
  versé affiché à l'écran.
"""
from __future__ import annotations

from django.db.models import Case, DecimalField, Q, QuerySet, Sum, Value, When

from apps.solidarity.models import Solidarity
from apps.wallet.models import Transaction

_DECIMAL_OUT = DecimalField(max_digits=10, decimal_places=0)


def _conditional_sum(*, type_transaction: str) -> Sum:
    """`Sum` conditionnel (transactions réussies du type donné), 0 si aucune
    ligne ne correspond (`Coalesce` implicite via `Case`/`Value`)."""
    return Sum(
        Case(
            When(
                transaction__type_transaction=type_transaction,
                transaction__statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
                then="transaction__montant_transaction",
            ),
            default=Value(0),
            output_field=_DECIMAL_OUT,
        )
    )


def list_solidarities(
    *,
    search: str = "",
    etat: str = "",
    objectif_atteint: str = "",
    versement_effectue: str = "",
) -> QuerySet[Solidarity]:
    """Queryset des tontines solidaires, enrichi des agrégats affichés en
    liste (`montant_collecte`, `montant_verse`) via `annotate`, pour éviter
    une requête par ligne. Tri par date de création décroissante.
    """
    qs = (
        Solidarity.objects.select_related("hote")
        .annotate(
            montant_collecte=_conditional_sum(
                type_transaction=Transaction.TYPE_TRANSACTION.CONTRIBUTION_SOLIDAIRE
            ),
            montant_verse=_conditional_sum(
                type_transaction=Transaction.TYPE_TRANSACTION.VERSEMENT_SOLIDAIRE
            ),
        )
        .order_by("-date_creation")
    )

    search = (search or "").strip()
    if search:
        qs = qs.filter(
            Q(hote__username__icontains=search)
            | Q(hote__numero_telephone__icontains=search)
            | Q(beneficiaire_telephone__icontains=search)
            | Q(description__icontains=search)
        )

    etat = (etat or "").strip()
    if etat:
        qs = qs.filter(etat=etat)

    if objectif_atteint in ("true", "false"):
        qs = qs.filter(objectif_atteint=(objectif_atteint == "true"))

    if versement_effectue in ("true", "false"):
        qs = qs.filter(versement_effectue=(versement_effectue == "true"))

    return qs


def get_solidarity(solidarity_id) -> Solidarity:
    """Récupère une tontine solidaire par id (404 si absente — même piège
    d'héritage multi-table que `list_solidarities`)."""
    return list_solidarities().get(pk=solidarity_id)


def mask_phone_number(numero: str) -> str:
    """Masque un numéro de téléphone tiers pour l'affichage en liste : ne
    conserve que l'indicatif (chiffres avant les 6 derniers) et les deux
    derniers chiffres, le reste étant remplacé par des astérisques.

    `beneficiaire_telephone` est une donnée personnelle d'un tiers qui n'a
    pas consenti à figurer en clair dans un écran de back-office consulté
    par des opérateurs sans lien direct avec lui (contrairement à
    l'organisateur, authentifié comme hôte de la collecte) : seul un besoin
    métier explicite (ex : contact en cas de litige) justifierait de la
    révéler intégralement, via une action dédiée — hors périmètre ici.
    """
    numero = (numero or "").strip()
    if len(numero) <= 4:
        # Trop court pour distinguer indicatif/suffixe : masquage intégral.
        return "*" * len(numero)
    indicatif, milieu, suffixe = numero[:3], numero[3:-2], numero[-2:]
    return f"{indicatif}{'*' * len(milieu)}{suffixe}"
