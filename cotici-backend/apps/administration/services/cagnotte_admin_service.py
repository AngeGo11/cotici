"""Consultation et modération des cagnottes depuis le back-office.

Périmètre strict : `Cagnotte.objects` (hérite de `Tontine` en héritage
multi-table, même table de base `tontine_tontine`, `type_tontine=CAGNOTTE`).
Utiliser `Cagnotte.objects` plutôt que `Tontine.objects.filter(...)` élimine
d'office les tontines de groupe et les tontines solidaires — voir
`apps.administration.services.tontine_admin_service` pour le même piège côté
tontines de groupe.

Le montant collecté n'est PAS un champ stocké : il se calcule à la volée par
somme des `Transaction` de type `CONTRIBUTION_CAGNOTTE` au statut `RÉUSSIE`
rattachées à la cagnotte (`Transaction.tontine_id == cagnotte.pk`, la cagnotte
étant elle-même une ligne `Tontine` via l'héritage multi-table). Voir la note
au sommet de `apps.wallet.models.Transaction.TYPE_TRANSACTION` : le type
`CONTRIBUTION_SOLIDAIRE` a historiquement été utilisé par erreur à la place de
`CONTRIBUTION_CAGNOTTE` pour des cagnottes — ne jamais compter autre chose que
`CONTRIBUTION_CAGNOTTE` ici, sous peine de sous/sur-évaluer la collecte.

La modération (archiver / restaurer / supprimer logiquement) n'agit que sur
`etat`/`est_active`/`date_archivage`/`date_suppression` : elle ne touche
jamais aux soldes ni aux transactions (aucun mouvement financier n'est
déclenché depuis ce module).
"""
from __future__ import annotations

from decimal import Decimal

from django.db import transaction
from django.db.models import Count, DecimalField, Q, QuerySet, Sum, Value
from django.db.models.functions import Coalesce
from django.utils import timezone

from apps.cagnotte.models import Cagnotte
from apps.tontine.models import Tontine, TontineMembre
from apps.wallet.models import Transaction


class InvalidModerationActionError(Exception):
    """Levée lorsqu'une action de modération demandée n'est pas reconnue."""


class ModerationAction:
    """Actions de modération supportées par `moderate_cagnotte`."""

    ARCHIVE = "archive"
    RESTORE = "restore"
    DELETE = "delete"

    ALL = (ARCHIVE, RESTORE, DELETE)


def _collected_amount_annotation():
    """Somme des contributions réussies (`CONTRIBUTION_CAGNOTTE`), en
    `Decimal` — `Coalesce(..., Value(0))` pour renvoyer `0` (et non `None`)
    quand aucune contribution n'a encore été enregistrée."""
    return Coalesce(
        Sum(
            "transaction__montant_transaction",
            filter=Q(
                transaction__type_transaction=Transaction.TYPE_TRANSACTION.CONTRIBUTION_CAGNOTTE,
                transaction__statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
            ),
        ),
        Value(0),
        output_field=DecimalField(max_digits=12, decimal_places=0),
    )


def list_cagnottes(
    *, search: str = "", etat: str = "", objectif_atteint: bool | None = None
) -> QuerySet[Cagnotte]:
    """Queryset des cagnottes, enrichi du montant collecté (`annotate`, jamais
    calculé en boucle Python) et du nombre de membres. Tri par date de
    création décroissante (les plus récentes en premier)."""
    qs = (
        Cagnotte.objects.select_related("hote")
        .annotate(
            montant_collecte=_collected_amount_annotation(),
            membres_count=Count(
                "tontinemembre",
                filter=Q(tontinemembre__statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF),
                distinct=True,
            ),
        )
        .order_by("-date_creation")
    )

    search = (search or "").strip()
    if search:
        qs = qs.filter(
            Q(nom_cagnotte__icontains=search)
            | Q(description__icontains=search)
            | Q(hote__username__icontains=search)
            | Q(hote__first_name__icontains=search)
            | Q(hote__last_name__icontains=search)
            | Q(hote__numero_telephone__icontains=search)
        )

    etat = (etat or "").strip()
    if etat:
        qs = qs.filter(etat=etat)

    if objectif_atteint is not None:
        qs = qs.filter(objectif_atteint=objectif_atteint)

    return qs


def get_cagnotte_detail_context(cagnotte: Cagnotte) -> dict:
    """Contexte complet pour l'écran de détail : membres de la cagnotte,
    préchargés en une requête (`select_related`)."""
    membres = (
        TontineMembre.objects.filter(tontine_id=cagnotte.pk)
        .select_related("membre")
        .order_by("date_adhesion")
    )
    return {"membres": membres}


@transaction.atomic
def moderate_cagnotte(
    *, actor, cagnotte: Cagnotte, action: str, reason: str
) -> tuple[Cagnotte, dict, dict]:
    """Applique une action de modération sur une cagnotte.

    Verrouille la ligne (`select_for_update`) pour prévenir toute course avec
    une écriture concurrente (ex : l'organisateur qui archiverait sa propre
    cagnotte au même instant). Ne touche JAMAIS aux soldes ni aux
    transactions : uniquement `etat`/`est_active`/`date_archivage`/
    `date_suppression`. Retourne `(cagnotte, before, after)` pour permettre à
    la vue d'écrire l'entrée d'audit (before/after des champs d'état).
    """
    if action not in ModerationAction.ALL:
        raise InvalidModerationActionError(f"Action de modération inconnue : {action!r}")

    locked = Cagnotte.objects.select_for_update().get(
        pk=cagnotte.pk, type_tontine=Tontine.TYPE_TONTINE.CAGNOTTE
    )
    before = {"etat": locked.etat, "est_active": locked.est_active}
    now = timezone.now()

    if action == ModerationAction.ARCHIVE:
        locked.etat = Tontine.ETAT.ARCHIVE
        locked.est_active = False
        locked.date_archivage = now
    elif action == ModerationAction.RESTORE:
        locked.etat = Tontine.ETAT.ACTIF
        locked.est_active = True
        locked.date_archivage = None
        locked.date_suppression = None
    elif action == ModerationAction.DELETE:
        locked.etat = Tontine.ETAT.SUPPRIME
        locked.est_active = False
        locked.date_suppression = now

    locked.save(update_fields=["etat", "est_active", "date_archivage", "date_suppression"])

    after = {"etat": locked.etat, "est_active": locked.est_active}
    return locked, before, after


def progression_percent(montant_collecte: Decimal, objectif_cotisation: int) -> float:
    """Pourcentage de progression vers l'objectif, plafonné à 100.

    `objectif_cotisation` (`Cagnotte`) est un `IntegerField` (jamais nul ni
    négatif, garanti par la contrainte `cagnotte_objectif_cotisation_positif`
    en base) : pas de division par zéro à défendre ici, mais on reste
    défensif face à une donnée corrompue par un futur appelant.
    """
    if not objectif_cotisation:
        return 0.0
    ratio = (Decimal(montant_collecte) / Decimal(objectif_cotisation)) * Decimal(100)
    return float(min(ratio, Decimal(100)).quantize(Decimal("0.1")))
