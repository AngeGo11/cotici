"""Consultation et modération des tontines de groupe depuis le back-office.

Périmètre strict : `type_tontine=GROUPE` uniquement. `Cagnotte`
(`apps.cagnotte`) et les tontines solidaires (`apps.solidarity`) héritent de
`Tontine` en héritage multi-table (même table de base `tontine_tontine`) :
sans ce filtre, la liste des tontines de groupe afficherait aussi des
cagnottes et des tontines solidaires, qui relèvent d'écrans back-office
dédiés (gérés par d'autres modules).

La modération (archiver / restaurer / supprimer logiquement) n'agit que sur
`etat`/`est_active`/`date_archivage`/`date_suppression` : elle ne touche
jamais aux soldes ni aux transactions (aucun mouvement financier n'est
déclenché depuis ce module).
"""
from __future__ import annotations

from django.db import transaction
from django.db.models import Count, Q, QuerySet
from django.utils import timezone

from apps.tontine.models import Penalite, Tontine, TontineMembre, TourTontine


class InvalidModerationActionError(Exception):
    """Levée lorsqu'une action de modération demandée n'est pas reconnue."""


class ModerationAction:
    """Actions de modération supportées par `moderate_tontine`."""

    ARCHIVE = "archive"
    RESTORE = "restore"
    DELETE = "delete"

    ALL = (ARCHIVE, RESTORE, DELETE)


def list_tontines(*, search: str = "", etat: str = "") -> QuerySet[Tontine]:
    """Queryset des tontines de groupe, enrichi des compteurs affichés en
    liste (nombre de membres actifs, nombre de tours) via `annotate` pour
    éviter une requête par ligne. Tri par date de création décroissante.
    """
    qs = (
        Tontine.objects.filter(type_tontine=Tontine.TYPE_TONTINE.GROUPE)
        .select_related("hote")
        .annotate(
            membres_count=Count(
                "tontinemembre",
                filter=Q(tontinemembre__statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF),
                distinct=True,
            ),
            tours_count=Count("tourtontine", distinct=True),
        )
        .order_by("-date_creation")
    )

    search = (search or "").strip()
    if search:
        qs = qs.filter(
            Q(description__icontains=search)
            | Q(hote__username__icontains=search)
            | Q(hote__numero_telephone__icontains=search)
        )

    etat = (etat or "").strip()
    if etat:
        qs = qs.filter(etat=etat)

    return qs


def get_tontine(tontine_id) -> Tontine:
    """Récupère une tontine de groupe par id (404 si absente ou d'un autre
    type — même piège d'héritage multi-table que `list_tontines`)."""
    return list_tontines().get(pk=tontine_id)


def get_tontine_detail_context(tontine: Tontine) -> dict:
    """Contexte complet pour l'écran de détail : règles, membres, tours et
    pénalités en cours, chacun préchargé en une requête (`select_related`/
    `prefetch_related` implicite via des querysets filtrés dédiés)."""
    regle = getattr(tontine, "tontineregle", None)
    membres = (
        TontineMembre.objects.filter(tontine=tontine)
        .select_related("membre")
        .order_by("ordre_ramassage")
    )
    tours = (
        TourTontine.objects.filter(tontine=tontine)
        .select_related("user")
        .order_by("numero_du_tour")
    )
    penalites_en_cours = (
        Penalite.objects.filter(tontine=tontine, est_reglee=False, est_annulee=False)
        .select_related("user", "tour")
        .order_by("-date_attribution_penalite")
    )
    return {
        "regle": regle,
        "membres": membres,
        "tours": tours,
        "penalites_en_cours": penalites_en_cours,
    }


@transaction.atomic
def moderate_tontine(*, actor, tontine: Tontine, action: str, reason: str) -> tuple[Tontine, dict, dict]:
    """Applique une action de modération sur une tontine de groupe.

    Verrouille la ligne (`select_for_update`) pour prévenir toute course
    avec une écriture concurrente (ex : l'hôte qui archiverait sa propre
    tontine au même instant). Retourne `(tontine, before, after)` pour
    permettre à la vue d'écrire l'entrée d'audit (before/after des champs
    d'état).
    """
    if action not in ModerationAction.ALL:
        raise InvalidModerationActionError(f"Action de modération inconnue : {action!r}")

    locked = (
        Tontine.objects.select_for_update()
        .get(pk=tontine.pk, type_tontine=Tontine.TYPE_TONTINE.GROUPE)
    )
    before = {
        "etat": locked.etat,
        "est_active": locked.est_active,
    }
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

    after = {
        "etat": locked.etat,
        "est_active": locked.est_active,
    }
    return locked, before, after
