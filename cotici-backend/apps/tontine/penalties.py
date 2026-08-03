"""Calcul pur des pénalités de retard de tontine (miroir de `scheduling.py`).

Module SANS I/O (pas d'ORM, pas d'appel réseau/horloge implicite : `now` est
toujours injecté par l'appelant) : c'est la seule source de vérité pour
déterminer si un tour est en retard, la deadline applicable, le montant à
prélever et les garde-fous d'activation. Testable à 100 % sans base de
données — `apps/tontine/services/penalties_service.py`,
`apps/tontine/services/cloture_service.py` (couches I/O) et les jobs/tâches
management s'appuient dessus sans jamais dupliquer cette logique.

Règle de retard — deadline UNIFORME par tour (paiement libre) :
depuis l'abandon du séquencement des paiements (tout membre actif peut
cotiser dès l'ouverture du tour, sans attendre son rang — l'ordre de
ramassage ne sert plus qu'à désigner le bénéficiaire), il n'existe plus de
notion de "payeur courant" ni de deadline glissante par membre. La deadline
est désormais la MÊME pour tous les membres d'un même tour :

    deadline_penalite = tour.date_echeance (ou tour.date si absente) + délai de grâce

Un membre est en retard dès lors que `now > deadline_penalite` ET qu'il n'a
pas encore cotisé — cette seconde condition (I/O) reste du ressort de la
couche appelante, ce module ne connaît que la deadline elle-même.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal

from apps.tontine.models import TontineRegle, TourTontine
from apps.tontine.scheduling import tour_echeance

# Plafond de dette non réglée (en multiples de `montant_cotisation`) au-delà
# duquel on cesse de constater de nouvelles pénalités/dettes automatiques pour
# un membre sur une tontine donnée, et on escalade vers un humain (admin).
# Sans ce plafond, un membre insolvable accumulerait des dettes à l'infini
# sans jamais pouvoir régulariser — un signal de dérive qui doit remonter à
# un administrateur plutôt que de continuer à s'aggraver automatiquement.
#
# ATTENTION — recalibrage nécessaire : ce seuil (3x la mise) a été calibré à
# l'origine pour un seul type de dette (`Penalite.montant_due`). Il s'applique
# désormais à la somme `Σ Penalite.montant_due + Σ DetteCotisation.montant_du`
# (voir `plafond_dette_atteint` ci-dessous et ses appelants), ce qui atteint le
# plafond mécaniquement plus vite qu'avant à configuration inchangée. Valeur
# volontairement NON modifiée ici : recalibrer ce nombre est une décision
# produit, pas une décision technique — signalé explicitement dans le rapport
# de livraison plutôt que tranché unilatéralement.
PLAFOND_DETTE_EN_COTISATIONS = 3


def delai_grace_delta(regle: TontineRegle) -> timedelta:
    """Durée du délai de grâce de `regle`, sous forme de `timedelta`."""
    return timedelta(hours=regle.delai_grace_heures)


def deadline_penalite(regle: TontineRegle, tour: TourTontine) -> datetime:
    """Date-limite UNIFORME avant constat d'une pénalité/dette sur `tour`.

    Identique pour tous les membres du tour (paiement libre, voir la
    docstring de module) : `tour.date_echeance` (ou `tour.date` si le cache
    est absent) + délai de grâce de la règle.
    """
    echeance = tour.date_echeance or tour.date
    return echeance + delai_grace_delta(regle)


def est_en_retard(regle: TontineRegle, tour: TourTontine, now: datetime) -> bool:
    """Vrai si la deadline uniforme de `tour` est dépassée à `now`.

    Ne préjuge PAS qu'un membre donné soit effectivement en retard : c'est à
    l'appelant de croiser ce résultat avec le fait que ce membre n'a pas
    encore cotisé (information I/O, hors de ce module pur).
    """
    return now > deadline_penalite(regle, tour)


def montant_penalite_pour(regle: TontineRegle) -> Decimal:
    """Montant de la pénalité constatée pour un retard sur `regle`."""
    return regle.montant_penalite


def plafond_dette_atteint(regle: TontineRegle, total_impaye: Decimal) -> bool:
    """Vrai si la dette impayée cumulée d'un membre atteint le plafond d'escalade.

    `total_impaye` DOIT être la somme de TOUTES les créances impayées/non
    annulées du membre sur cette tontine, tous types confondus :
    `Σ Penalite.montant_due + Σ DetteCotisation.montant_du` (calculée par
    l'appelant, cette fonction reste pure et agnostique du type de dette). Le
    plafond est exprimé en multiples de `montant_cotisation` — une dette
    proportionnelle à la mise, pas un montant absolu arbitraire. Voir la note
    de recalibrage sur `PLAFOND_DETTE_EN_COTISATIONS`.
    """
    seuil = regle.montant_cotisation * PLAFOND_DETTE_EN_COTISATIONS
    return total_impaye >= seuil


def penalites_auto_actives(
    regle: TontineRegle, tour: TourTontine, now: datetime, cutoff: "datetime | None"
) -> bool:
    """Garde-fous d'activation : vrai seulement si TOUTES les conditions sont réunies.

    Sans ces garde-fous combinés, le premier passage du recouvrement
    automatique après activation d'une règle historique débiterait
    rétroactivement tous les membres en retard depuis toujours :
    - `regle.penalites_automatiques` doit être explicitement à True ;
    - `regle.montant_penalite` doit être strictement positif (sinon rien à
      prélever) ;
    - le tour doit avoir une échéance connue et postérieure au `cutoff`
      global (`settings.PENALITES_AUTO_CUTOFF`) — `cutoff=None` désactive la
      fonctionnalité globalement, quelle que soit la règle de la tontine.
    """
    if not regle.penalites_automatiques:
        return False
    if regle.montant_penalite <= 0:
        return False
    if cutoff is None:
        return False
    if tour.date_echeance is None or tour.date_echeance < cutoff:
        return False
    return True


def reserve_cotisation(regle: TontineRegle, a_deja_cotise: bool) -> Decimal:
    """Réserve de cotisation à préserver dans le wallet avant tout prélèvement.

    Garde-fou anti-spirale de dette, utilisé aussi bien par
    `penalties_service._executer_prelevement` (règlement d'une `Penalite`)
    que par `dette_service._executer_reglement_dette` (règlement d'une
    `DetteCotisation`, ancienne ou récente) : si le membre n'a pas encore
    réglé sa cotisation du tour EN COURS, prélever intégralement une pénalité
    OU une vieille dette pourrait vider son wallet et l'empêcher de cotiser
    ensuite — ce qui générerait mécaniquement une NOUVELLE dette/pénalité sur
    le tour courant. La cotisation du tour en cours (contrat principal) a
    donc toujours priorité sur tout recouvrement de dette/pénalité
    (accessoire) : on ne prélève que sur ce qui excède la mise attendue.
    """
    if a_deja_cotise:
        return Decimal("0")
    return regle.montant_cotisation
