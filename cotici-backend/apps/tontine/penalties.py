"""Calcul pur des pénalités de retard de tontine (miroir de `scheduling.py`).

Module SANS I/O (pas d'ORM, pas d'appel réseau/horloge implicite : `now` est
toujours injecté par l'appelant) : c'est la seule source de vérité pour
déterminer si un membre est en retard, la deadline applicable, le montant à
prélever et les garde-fous d'activation. Testable à 100 % sans base de
données — `apps/tontine/services/penalties_service.py` (couche I/O) et
`apps/tontine/management/commands/apply_tontine_penalties.py` (job) s'appuient
dessus sans jamais dupliquer cette logique.

Règle de retard — deadline GLISSANTE par membre (voir la spec produit) :
le paiement d'un tour est séquentiel (`next_member_to_pay`), un membre de rang
N ne peut structurellement pas payer avant que le rang N-1 ait payé. Seul le
membre `next_member_to_pay` courant est donc pénalisable :

    devenu_payeur_at  = date du débit réussi du membre de rang immédiatement
                        inférieur, ou `tour.date` si ce membre est le premier
                        de l'ordre de ramassage
    deadline_penalite = max(tour.date_echeance, devenu_payeur_at) + délai de grâce
    en_retard         = now > deadline_penalite
"""
from __future__ import annotations

from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional

from apps.tontine.models import TontineRegle, TourTontine
from apps.tontine.scheduling import tour_echeance

# Plafond de dette non réglée (en multiples de `montant_cotisation`) au-delà
# duquel on cesse de constater de nouvelles pénalités automatiques pour un
# membre sur une tontine donnée, et on escalade vers un humain (admin). Sans
# ce plafond, un membre insolvable accumulerait des pénalités à l'infini sans
# jamais pouvoir régulariser — un signal de dérive qui doit remonter à un
# administrateur plutôt que de continuer à s'aggraver automatiquement.
PLAFOND_DETTE_EN_COTISATIONS = 3


def delai_grace_delta(regle: TontineRegle) -> timedelta:
    """Durée du délai de grâce de `regle`, sous forme de `timedelta`."""
    return timedelta(hours=regle.delai_grace_heures)


def deadline_penalite(
    regle: TontineRegle, tour: TourTontine, devenu_payeur_at: datetime
) -> datetime:
    """Date-limite avant constat d'une pénalité pour le payeur courant de `tour`.

    `devenu_payeur_at` est la date à laquelle CE membre est structurellement
    devenu capable de payer (débit réussi du membre de rang immédiatement
    inférieur, ou `tour.date` s'il est premier de l'ordre de ramassage) —
    voir la docstring de module. `tour.date_echeance` peut être antérieure à
    cette date (le tour était déjà à échéance quand le membre est devenu
    payeur) : on retient toujours la plus tardive des deux, jamais la
    pénalité ne peut être constatée avant que le membre ait pu, dans les
    faits, effectuer son paiement.
    """
    echeance = tour.date_echeance or tour.date
    base = max(echeance, devenu_payeur_at)
    return base + delai_grace_delta(regle)


def est_en_retard(
    regle: TontineRegle,
    tour: TourTontine,
    devenu_payeur_at: datetime,
    now: datetime,
) -> bool:
    """Vrai si le payeur courant de `tour` a dépassé sa deadline de pénalité."""
    return now > deadline_penalite(regle, tour, devenu_payeur_at)


def montant_penalite_pour(regle: TontineRegle) -> Decimal:
    """Montant de la pénalité constatée pour un retard sur `regle`."""
    return regle.montant_penalite


def plafond_dette_atteint(regle: TontineRegle, total_impaye: Decimal) -> bool:
    """Vrai si la dette impayée cumulée d'un membre atteint le plafond d'escalade.

    `total_impaye` est la somme des `montant_due` non réglés/non annulés du
    membre sur CETTE tontine (calculée par l'appelant, cette fonction reste
    pure). Le plafond est exprimé en multiples de `montant_cotisation` — une
    dette proportionnelle à la mise, pas un montant absolu arbitraire.
    """
    seuil = regle.montant_cotisation * PLAFOND_DETTE_EN_COTISATIONS
    return total_impaye >= seuil


def penalites_auto_actives(
    regle: TontineRegle, tour: TourTontine, now: datetime, cutoff: Optional[datetime]
) -> bool:
    """Garde-fous d'activation : vrai seulement si TOUTES les conditions sont réunies.

    Sans ces garde-fous combinés, le premier passage du job de recouvrement
    après activation d'une règle historique débiterait rétroactivement tous
    les membres en retard depuis toujours :
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

    Garde-fou anti-spirale de dette : si le membre n'a pas encore réglé sa
    cotisation du tour en cours, prélever intégralement sa pénalité pourrait
    vider son wallet et l'empêcher de cotiser ensuite — ce qui générerait
    mécaniquement une NOUVELLE pénalité. La cotisation (contrat principal) a
    donc toujours priorité sur la pénalité (accessoire) : on ne prélève la
    pénalité que sur ce qui excède la mise attendue.
    """
    if a_deja_cotise:
        return Decimal("0")
    return regle.montant_cotisation
