"""Clôture FORCÉE d'un tour de tontine à échéance ("23h59" heure locale).

Règle produit 2026 — "clôture avec impayés" : inverse le comportement
HISTORIQUE de `apps.tontine.views._changer_tour_impl`, qui BLOQUAIT la
clôture tant qu'un membre n'avait pas cotisé. Ici, à l'échéance :
1. chaque membre encore impayé se voit constater une `DetteCotisation`
   (créancier : le bénéficiaire lésé du tour, `tour.user`) — jamais un
   `Penalite`, natures distinctes, voir `apps.tontine.models.DetteCotisation` ;
2. une `Penalite` est également constatée pour chaque impayé si les
   garde-fous d'activation le permettent (`penalites_auto_actives`) — mais
   n'est JAMAIS créditée ici : Décision produit 2 ("pénalité versée au
   règlement, pas au constat") — la déférer évite de rémunérer trois fois le
   bénéficiaire pour un même retard (pot partiel + dette + pénalité toutes
   immédiates) ;
3. le bénéficiaire du tour reçoit IMMÉDIATEMENT un POT PARTIEL = le montant
   RÉELLEMENT collecté (`tour.montant_depose`, jamais un montant théorique de
   repli — voir le bug corrigé dans `_changer_tour_impl`) ;
4. le cycle avance au tour suivant (ou clôture la tontine si c'était le
   dernier tour) — jamais bloqué par des impayés.

Compensation du bénéficiaire (règle produit 3) — DÉCISION DE PORTÉE
(documentée dans le rapport de livraison) : ce module NE nette PAS les
dettes/pénalités préexistantes du bénéficiaire contre son nouveau versement à
l'intérieur de CETTE transaction. Nets-les de façon synchrone ici exigerait de
verrouiller un nombre NON BORNÉ de wallets tiers (chaque créancier de chaque
vieille dette), ce qui romprait l'invariant central du module (« une
transaction courte, un seul wallet crédité, aucun risque de deadlock à
verrous multiples non ordonnés »). La compensation est donc obtenue par
ENCHAÎNEMENT plutôt que par imbrication : la tâche Celery
(`apps.tontine.tasks.tache_cloturer_tour`) déclenche, juste après la
clôture, un recouvrement ciblé du bénéficiaire
(`apps.tontine.services.recouvrement_service.regler_creances_membre`), qui
réutilise EXCLUSIVEMENT les chemins de débit uniques déjà existants
(`penalties_service.tenter_prelevement` / `dette_service.tenter_reglement_dette`,
chacun sa propre transaction courte). Résultat identique pour l'utilisateur
(ses vieilles dettes sont soldées à partir de l'argent qu'il vient de
recevoir), sans jamais élargir la portée de verrouillage de la clôture
elle-même. `TourTontine.montant_compense_beneficiaire` reste donc à 0 au
moment de la clôture par construction : la compensation réelle est visible
dans le grand livre (`Transaction`) et le statut des `DetteCotisation`/`Penalite`
concernées, pas rétroactivement dans ce champ figé au moment de la clôture.
"""
from __future__ import annotations

import dataclasses
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Optional

from django.conf import settings
from django.db import transaction
from django.utils import timezone

from apps.audits.models import AuditLog
from apps.notifications.domain.catalog import spec_dette_cotisation_constatee, spec_paiement_valide, spec_pot_partiel_recu
from apps.notifications.domain.dedup import dedup_dette_cotisation_constatee, dedup_pot_partiel_recu
from apps.notifications.services.notification_service import NotificationService
from apps.tontine.helpers import active_members_ordered, display_name, member_user_ids_paid_for_tour
from apps.tontine.models import DetteCotisation, Tontine, TontineRegle, TourTontine
from apps.tontine.services.penalties_service import constater_penalite
from apps.utils.utilitaires import _unique_ref
from apps.wallet.models import Transaction, Wallet


class StatutCloture(str, Enum):
    CLOTUREE = "cloturee"
    DEJA_CLOTUREE = "deja_cloturee"
    IMPOSSIBLE = "impossible"


@dataclass(frozen=True)
class ResultatCloture:
    statut: StatutCloture
    tour_id: int
    statut_tour: Optional[str] = None
    montant_collecte: Optional[Decimal] = None
    montant_verse: Optional[Decimal] = None
    nombre_fautifs: int = 0
    beneficiaire_id: Optional[int] = None
    tour_suivant_id: Optional[int] = None
    tontine_terminee: bool = False


def cloturer_tour(tour_id: int, *, now: Optional[datetime] = None) -> ResultatCloture:
    """Clôture FORCÉE d'un tour EN_COURS à son échéance, avec ou sans impayés.

    IDEMPOTENT : un second appel sur un tour déjà clôturé (par ce chemin ou
    par la clôture manuelle admin `_changer_tour_impl`) est un no-op
    (`StatutCloture.DEJA_CLOTUREE`) — sûr à ré-invoquer en cas de
    chevauchement de la tâche planifiée (voir `apps.tontine.tasks`).

    UNE SEULE `transaction.atomic()` COURTE pour CE tour (jamais un lot
    entier — voir la tâche Celery appelante pour l'itération sur plusieurs
    tours dus).

    Ordre des verrous, borné à UN SEUL wallet (celui du bénéficiaire du
    tour — aucun wallet fautif n'est débité ici, voir la docstring de
    module) : `Wallet(bénéficiaire) -> Tontine -> TourTontine`, puis création
    des `DetteCotisation`/`Penalite` (constat pur, sans effet sur un solde).
    """
    now = now or timezone.now()

    tour = TourTontine.objects.select_related("tontine").get(pk=tour_id)
    if tour.statut_tour != TourTontine.STATUT_TOUR.EN_COURS:
        return ResultatCloture(statut=StatutCloture.DEJA_CLOTUREE, tour_id=tour_id, statut_tour=tour.statut_tour)

    try:
        regle = tour.tontine.tontineregle
    except TontineRegle.DoesNotExist:
        return ResultatCloture(statut=StatutCloture.IMPOSSIBLE, tour_id=tour_id)

    montant_verse = Decimal("0")
    montant_collecte = Decimal("0")
    fautifs_count = 0
    dettes_creees: list = []
    tour_suivant_id = None
    tontine_terminee = False
    ref_credit = ""

    with transaction.atomic():
        benef_wallet, _ = Wallet.objects.select_for_update().get_or_create(user_id=tour.user_id)
        # Verrou tontine : sérialise avec `_changer_tour_impl`/`demarrer_tontine`
        # (même précaution documentée là-bas contre la création concurrente du
        # tour suivant).
        Tontine.objects.select_for_update().get(pk=tour.tontine_id)
        tour_locked = (
            TourTontine.objects.select_for_update().select_related("tontine").get(pk=tour.pk)
        )
        if tour_locked.statut_tour != TourTontine.STATUT_TOUR.EN_COURS:
            return ResultatCloture(
                statut=StatutCloture.DEJA_CLOTUREE, tour_id=tour_id, statut_tour=tour_locked.statut_tour
            )

        membres = active_members_ordered(tour_locked.tontine)
        paid_ids = member_user_ids_paid_for_tour(tour_locked.tontine, tour_locked)
        fautifs = [tm for tm in membres if tm.membre_id not in paid_ids]
        fautifs_count = len(fautifs)

        # Pot partiel : TOUJOURS le montant réellement collecté, jamais un
        # montant théorique de repli (voir le bug équivalent corrigé dans
        # `apps.tontine.views._changer_tour_impl`).
        montant_collecte = tour_locked.montant_depose
        montant_attendu = regle.montant_cotisation * regle.nombre_max
        montant_verse = montant_collecte

        for fautif in fautifs:
            dette, created = DetteCotisation.objects.get_or_create(
                tour=tour_locked,
                debiteur_id=fautif.membre_id,
                defaults={
                    "tontine": tour_locked.tontine,
                    "beneficiaire_lese_id": tour_locked.user_id,
                    "montant_initial": regle.montant_cotisation,
                    "montant_du": regle.montant_cotisation,
                    "motif": (
                        f"Cotisation manquée (tour {tour_locked.numero_du_tour}), "
                        "clôture forcée à échéance."
                    ),
                },
            )
            if created:
                dettes_creees.append(dette)

            # Pénalité : constatée, JAMAIS créditée ici (Décision produit 2 —
            # voir docstring de module). `ignorer_delai_grace=True` : à la
            # clôture, il n'y a plus de "plus tard" pendant lequel le délai de
            # grâce pourrait finir de s'écouler.
            constater_penalite(
                tour_locked, fautif.membre, regle, now=now, ignorer_delai_grace=True
            )

        tour_locked.montant_attendu = montant_attendu
        tour_locked.montant_compense_beneficiaire = Decimal("0")
        tour_locked.montant_verse_beneficiaire = montant_verse
        tour_locked.statut_tour = (
            TourTontine.STATUT_TOUR.TERMINE if not fautifs else TourTontine.STATUT_TOUR.CLOTURE_INCOMPLET
        )
        tour_locked.save(
            update_fields=[
                "montant_attendu",
                "montant_compense_beneficiaire",
                "montant_verse_beneficiaire",
                "statut_tour",
            ]
        )

        if montant_verse > 0:
            benef_wallet.solde_courant += montant_verse
            benef_wallet.save(update_fields=["solde_courant"])
            ref_credit = _unique_ref("T")
            Transaction.objects.create(
                wallet=benef_wallet,
                solde_courant=benef_wallet.solde_courant,
                ref_transaction=ref_credit,
                mode_de_paiement=Transaction.MODE_DE_PAIEMENT.SOLDE_COTICI,
                montant_transaction=montant_verse,
                statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
                type_transaction=Transaction.TYPE_TRANSACTION.DEPOT,
            )

        AuditLog.objects.create(
            user=None,
            user_display="système (cloture_service)",
            action=AuditLog.Action.ROUND_CLOSED,
            resource=(
                f"tontine:{tour_locked.tontine_id}:tour:{tour_locked.pk}:"
                f"numero={tour_locked.numero_du_tour}:collecte={montant_collecte}:"
                f"verse={montant_verse}:fautifs={fautifs_count}:auto=1"
            ),
            status=AuditLog.Status.SUCCESS,
        )

        # Avance au tour suivant / clôture de la tontine. Import différé
        # (évite tout cycle module-level avec `apps.tontine.views`).
        from apps.tontine.views import _beneficiaire_pour_tour

        numero_suivant = tour_locked.numero_du_tour + 1
        if numero_suivant > regle.nombre_tours:
            tour_locked.tontine.est_active = False
            tour_locked.tontine.save(update_fields=["est_active"])
            tontine_terminee = True
        elif not TourTontine.objects.filter(
            tontine=tour_locked.tontine, numero_du_tour=numero_suivant
        ).exists():
            beneficiaire_suivant = _beneficiaire_pour_tour(
                tour_locked.tontine,
                regle,
                numero_suivant,
                exclude_user_ids={tour_locked.user_id},
                request_user=None,
            )
            if beneficiaire_suivant is not None:
                from apps.tontine.scheduling import tour_echeance

                nouveau = TourTontine.objects.create(
                    tontine=tour_locked.tontine,
                    user=beneficiaire_suivant,
                    numero_du_tour=numero_suivant,
                    montant_depose=Decimal("0"),
                    statut_tour=TourTontine.STATUT_TOUR.EN_COURS,
                )
                nouveau.date_echeance = tour_echeance(regle, nouveau)
                nouveau.save(update_fields=["date_echeance"])
                tour_suivant_id = nouveau.pk

                AuditLog.objects.create(
                    user=None,
                    user_display="système (cloture_service)",
                    action=AuditLog.Action.ROUND_STARTED,
                    resource=(
                        f"tontine:{tour_locked.tontine_id}:tour:{nouveau.pk}:"
                        f"numero={numero_suivant}:auto=1"
                    ),
                    status=AuditLog.Status.SUCCESS,
                )

    # Notifications hors verrou (idempotentes — sûres à rejouer).
    if montant_verse > 0:
        if fautifs_count:
            NotificationService.emit_idempotent(
                destinataire=tour_locked.user,
                spec=dataclasses.replace(
                    spec_pot_partiel_recu(
                        tontine_nom=display_name(tour_locked.tontine),
                        tontine_id=tour_locked.tontine_id,
                        tour_num=tour_locked.numero_du_tour,
                        montant_verse=montant_verse,
                        montant_attendu=montant_attendu,
                    ),
                    dedup_key=dedup_pot_partiel_recu(tour_id=tour_locked.pk),
                ),
            )
        else:
            NotificationService.emit(
                destinataire=tour_locked.user,
                spec=spec_paiement_valide(
                    kind="versement",
                    montant=montant_verse,
                    ref=ref_credit,
                    source_type="tontine",
                    source_id=tour_locked.tontine_id,
                ),
            )

    for dette in dettes_creees:
        NotificationService.emit_idempotent(
            destinataire=dette.debiteur,
            spec=dataclasses.replace(
                spec_dette_cotisation_constatee(
                    tontine_nom=display_name(tour_locked.tontine),
                    tontine_id=tour_locked.tontine_id,
                    tour_num=tour_locked.numero_du_tour,
                    montant=dette.montant_initial,
                ),
                dedup_key=dedup_dette_cotisation_constatee(dette_id=dette.pk),
            ),
        )

    return ResultatCloture(
        statut=StatutCloture.CLOTUREE,
        tour_id=tour_locked.pk,
        statut_tour=tour_locked.statut_tour,
        montant_collecte=montant_collecte,
        montant_verse=montant_verse,
        nombre_fautifs=fautifs_count,
        beneficiaire_id=tour_locked.user_id,
        tour_suivant_id=tour_suivant_id,
        tontine_terminee=tontine_terminee,
    )
