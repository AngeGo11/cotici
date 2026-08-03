"""Orchestration du recouvrement des créances d'un membre (dettes + pénalités).

Règle comptable validée : lors d'un recouvrement, TOUTES les
`DetteCotisation` d'un débiteur sont imputées AVANT ses `Penalite` (FIFO par
ancienneté au sein de chaque catégorie), et chaque ligne est réglée TOUT OU
RIEN (jamais de règlement fractionnaire). Ce module n'est qu'un
ORCHESTRATEUR : il ne débite JAMAIS un wallet lui-même, il se contente
d'itérer les créances impayées, dans l'ordre imposé, et de déléguer
CHAQUE règlement à l'unique chemin de débit correspondant
(`apps.tontine.services.dette_service.tenter_reglement_dette` /
`apps.tontine.services.penalties_service.tenter_prelevement`), CHACUN dans sa
propre transaction courte.

Sert deux usages :
- le recouvrement périodique global (toutes les créances impayées de toutes
  les tontines, voir `apps.tontine.tasks.tache_recouvrement_creances`) ;
- la "compensation" du bénéficiaire d'un tour qui vient de recevoir un pot
  (partiel ou complet) : appelée CIBLÉE sur ce seul membre juste après
  `cloture_service.cloturer_tour` (voir la docstring de ce dernier pour le
  choix d'architecture — enchaînement plutôt qu'imbrication transactionnelle).
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional

from django.db import IntegrityError
from django.utils import timezone

from apps.tontine.models import DetteCotisation, Penalite
from apps.tontine.services.dette_service import (
    DetteDejaTraiteeError,
    StatutReglementDette,
    tenter_reglement_dette,
)
from apps.tontine.services.penalties_service import (
    PenaliteDejaTraiteeError,
    StatutPrelevement,
    tenter_prelevement,
)


@dataclass
class ResultatRecouvrementMembre:
    dettes_reglees: int = 0
    dettes_insuffisant: int = 0
    penalites_reglees: int = 0
    penalites_insuffisant: int = 0


def regler_creances_membre(
    tontine_id: int, user_id: int, *, now: Optional[datetime] = None
) -> ResultatRecouvrementMembre:
    """Tente de solder, DANS L'ORDRE (dettes puis pénalités, FIFO), toutes les
    créances impayées de `user_id` sur la tontine `tontine_id`.

    S'ARRÊTE dès la première ligne impayable par manque de solde (respect du
    FIFO strict : on ne "saute" jamais une ligne ancienne pour en régler une
    plus récente et moins chère) — les lignes suivantes, de la même catégorie
    ou de la catégorie suivante, restent donc `EN ATTENTE` tant que celle-ci
    n'est pas soldée.
    """
    now = now or timezone.now()
    resultat = ResultatRecouvrementMembre()

    dettes = (
        DetteCotisation.objects.filter(
            tontine_id=tontine_id, debiteur_id=user_id, est_reglee=False, est_annulee=False
        )
        .order_by("date_constat")
        .select_related("tour", "debiteur")
    )
    for dette in dettes:
        try:
            r = tenter_reglement_dette(dette, now=now)
        except DetteDejaTraiteeError:
            continue
        except IntegrityError:
            continue
        if r.statut == StatutReglementDette.REGLEE:
            resultat.dettes_reglees += 1
        elif r.statut == StatutReglementDette.SOLDE_INSUFFISANT:
            resultat.dettes_insuffisant += 1
            break  # FIFO strict : on ne dépasse pas la première ligne impayable.

    if resultat.dettes_insuffisant:
        return resultat

    penalites = (
        Penalite.objects.filter(
            tontine_id=tontine_id, user_id=user_id, est_reglee=False, est_annulee=False, tour__isnull=False
        )
        .order_by("date_attribution_penalite")
        .select_related("tour", "user")
    )
    for penalite in penalites:
        try:
            r = tenter_prelevement(penalite, now=now)
        except PenaliteDejaTraiteeError:
            continue
        except IntegrityError:
            continue
        if r.statut == StatutPrelevement.REGLEE:
            resultat.penalites_reglees += 1
        elif r.statut == StatutPrelevement.SOLDE_INSUFFISANT:
            resultat.penalites_insuffisant += 1
            break

    return resultat
