"""Couche I/O transactionnelle des dettes de COTISATION MANQUÉE (`DetteCotisation`).

**Source de vérité UNIQUE du débit d'une `DetteCotisation`** : que le
déclencheur soit le recouvrement automatique (tâche/command périodique) ou
une action d'un admin/hôte, le débit passe toujours par
`_executer_reglement_dette` — il ne doit JAMAIS exister un second chemin de
code qui débite un wallet pour régler une dette de cotisation.

Ordre canonique des verrous — IDENTIQUE à celui documenté dans
`apps.tontine.services.penalties_service` (Wallet du débiteur fautif →
TourTontine → Wallet du créancier lésé → l'objet de dette lui-même) : toute
inversion crée un risque de deadlock sous charge concurrente, notamment avec
`penalties_service._executer_prelevement` qui verrouille les mêmes lignes
`Wallet`/`TourTontine` dans le même ordre relatif pour le même tour.

Règle comptable validée : lors d'un règlement, TOUTES les `DetteCotisation`
d'un débiteur sont imputées AVANT ses `Penalite` (FIFO par ancienneté au sein
de chaque catégorie), et chaque ligne est réglée TOUT OU RIEN (jamais de
règlement fractionnaire) — voir `regler_creances_membre` qui orchestre cet
ordre d'imputation en s'appuyant sur cette fonction ET sur
`penalties_service.tenter_prelevement`.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Optional

from django.db import transaction
from django.utils import timezone

from apps.audits.models import AuditLog
from apps.notifications.domain.catalog import spec_dette_cotisation_reglee
from apps.notifications.services.notification_service import NotificationService
from apps.tontine.helpers import display_name, display_name_user
from apps.tontine.models import DetteCotisation, TourTontine
from apps.tontine.penalties import reserve_cotisation
from apps.utils.utilitaires import _unique_ref
from apps.wallet.models import Transaction, Wallet


class DetteDejaTraiteeError(Exception):
    """La dette est déjà réglée ou annulée : plus rien à faire."""

    def __init__(self, dette_id: int):
        self.dette_id = dette_id
        super().__init__(f"Dette de cotisation {dette_id} déjà réglée ou annulée.")


class SoldeInsuffisantDetteError(Exception):
    """Le wallet du débiteur n'a pas les fonds nécessaires (+ réserve de cotisation)."""

    def __init__(self, *, solde: Decimal, montant_du: Decimal):
        self.solde = solde
        self.montant_du = montant_du
        super().__init__(f"Solde insuffisant ({solde} F) pour régler {montant_du} F.")


class StatutReglementDette(str, Enum):
    REGLEE = "reglee"
    DEJA_TRAITEE = "deja_traitee"
    SOLDE_INSUFFISANT = "solde_insuffisant"


@dataclass(frozen=True)
class ResultatReglementDette:
    statut: StatutReglementDette
    dette_id: int
    solde: Optional[Decimal] = None
    montant_du: Optional[Decimal] = None
    ref_transaction: Optional[str] = None


def _executer_reglement_dette(
    dette: DetteCotisation, *, now: datetime, acteur=None
) -> ResultatReglementDette:
    """Cœur transactionnel unique du débit d'une `DetteCotisation`.

    `dette` peut être une instance non verrouillée (lecture antérieure) :
    seuls ses identifiants FK immuables (`debiteur_id`, `tour_id`, `pk`) sont
    utilisés pour acquérir les verrous ; tous les champs mutables sont relus
    sous verrou avant toute décision. Le créancier (`beneficiaire_lese`) est
    DÉNORMALISÉ ET FIGÉ à la constatation (voir le modèle) : jamais recalculé
    dynamiquement, contrairement à la pénalité dont la destination transite
    par un point d'extension (`apps.tontine.services.penalite_destination`).
    """
    if not dette.tour_id:
        raise ValueError("Impossible de régler une dette sans tour associé.")

    with transaction.atomic():
        debiteur_wallet, _ = Wallet.objects.select_for_update().get_or_create(
            user_id=dette.debiteur_id
        )
        # NB : même remarque que `penalties_service._executer_prelevement` sur
        # l'absence de `select_related("tontine__tontineregle")` ici (OneToOne
        # inverse nullable incompatible avec `FOR UPDATE` sous PostgreSQL).
        tour = (
            TourTontine.objects.select_for_update().select_related("tontine").get(pk=dette.tour_id)
        )
        # Auto-créance (le débiteur est aussi son propre créancier — cas d'un
        # bénéficiaire qui n'a pas cotisé à son propre tour) : MÊME instance
        # Python pour les deux wallets, par construction (voir la docstring
        # de `penalties_service._executer_prelevement` pour le détail du bug
        # de lost update que ceci évite).
        d = DetteCotisation.objects.select_for_update().select_related("debiteur", "tontine").get(
            pk=dette.pk
        )
        if d.beneficiaire_lese_id == d.debiteur_id:
            lese_wallet = debiteur_wallet
        else:
            lese_wallet, _ = Wallet.objects.select_for_update().get_or_create(
                user_id=d.beneficiaire_lese_id
            )

        if d.est_reglee or d.est_annulee:
            raise DetteDejaTraiteeError(d.pk)

        regle = tour.tontine.tontineregle
        a_deja_cotise_tour_courant = (
            tour.statut_tour == TourTontine.STATUT_TOUR.EN_COURS
            and Transaction.objects.filter(
                tour=tour,
                tontine=tour.tontine,
                wallet__user_id=d.debiteur_id,
                type_transaction=Transaction.TYPE_TRANSACTION.DEBIT,
                statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
            ).exists()
        ) or tour.statut_tour != TourTontine.STATUT_TOUR.EN_COURS
        # Réserve anti-spirale : protège la cotisation du tour COURANT du
        # débiteur (pas forcément `tour`, qui est le tour où LA DETTE a été
        # constatée, potentiellement déjà clôturé) avant tout recouvrement.
        from apps.tontine.helpers import tour_en_cours as _tour_en_cours

        tour_courant_debiteur = _tour_en_cours(tour.tontine)
        a_deja_cotise = True
        if tour_courant_debiteur is not None:
            a_deja_cotise = Transaction.objects.filter(
                tour=tour_courant_debiteur,
                tontine=tour.tontine,
                wallet__user_id=d.debiteur_id,
                type_transaction=Transaction.TYPE_TRANSACTION.DEBIT,
                statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
            ).exists()
        reserve = reserve_cotisation(regle, a_deja_cotise)
        montant = d.montant_du

        if debiteur_wallet.solde_courant < montant + reserve:
            resultat = ResultatReglementDette(
                statut=StatutReglementDette.SOLDE_INSUFFISANT,
                dette_id=d.pk,
                solde=debiteur_wallet.solde_courant,
                montant_du=montant,
            )
        else:
            debiteur_wallet.solde_courant -= montant
            debiteur_wallet.save(update_fields=["solde_courant"])
            ref_debit = _unique_ref("DET")
            Transaction.objects.create(
                wallet=debiteur_wallet,
                tontine=tour.tontine,
                tour=tour,
                solde_courant=debiteur_wallet.solde_courant,
                ref_transaction=ref_debit,
                client_ref=f"dette:{d.pk}",
                mode_de_paiement=Transaction.MODE_DE_PAIEMENT.SOLDE_COTICI,
                montant_transaction=montant,
                statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
                type_transaction=Transaction.TYPE_TRANSACTION.DETTE_COTISATION,
            )

            lese_wallet.solde_courant += montant
            lese_wallet.save(update_fields=["solde_courant"])
            ref_credit = _unique_ref("VDT")
            Transaction.objects.create(
                wallet=lese_wallet,
                tontine=tour.tontine,
                tour=tour,
                solde_courant=lese_wallet.solde_courant,
                ref_transaction=ref_credit,
                client_ref=f"dettev:{d.pk}",
                mode_de_paiement=Transaction.MODE_DE_PAIEMENT.SOLDE_COTICI,
                montant_transaction=montant,
                statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
                type_transaction=Transaction.TYPE_TRANSACTION.VERSEMENT_DETTE_COTISATION,
            )

            d.est_reglee = True
            d.date_reglement = now
            d.montant_du = Decimal("0")
            d.ref_transaction_reglement = ref_debit
            d.save(
                update_fields=[
                    "est_reglee",
                    "date_reglement",
                    "montant_du",
                    "ref_transaction_reglement",
                ]
            )

            AuditLog.objects.create(
                user=acteur,
                user_display=(display_name_user(acteur) if acteur else "système (recouvrement)"),
                action=AuditLog.Action.PENALTY_PAID,
                resource=(
                    f"tontine:{tour.tontine_id}:membre:{d.debiteur_id}:tour:{tour.id}:"
                    f"dette:{d.pk}:montant={montant}:beneficiaire_lese={d.beneficiaire_lese_id}"
                    + (":auto=1" if acteur is None else "")
                ),
                status=AuditLog.Status.SUCCESS,
            )
            resultat = ResultatReglementDette(
                statut=StatutReglementDette.REGLEE, dette_id=d.pk, ref_transaction=ref_debit
            )

    if resultat.statut == StatutReglementDette.REGLEE:
        NotificationService.emit(
            destinataire=d.debiteur,
            spec=spec_dette_cotisation_reglee(
                tontine_nom=display_name(d.tontine), tontine_id=d.tontine_id, montant=montant
            ),
        )

    return resultat


def tenter_reglement_dette(dette: DetteCotisation, *, now: datetime) -> ResultatReglementDette:
    """Tentative de règlement automatique (job/tâche de recouvrement).

    Ne lève jamais d'exception pour solde insuffisant (résultat normal) ;
    lève `DetteDejaTraiteeError` en cas de course avec un règlement concurrent
    — l'appelant doit l'attraper et passer à l'élément suivant.
    """
    return _executer_reglement_dette(dette, now=now, acteur=None)


def regler_dette_par_wallet(dette: DetteCotisation, acteur) -> Transaction:
    """Règlement d'une dette par débit réel du wallet du débiteur (déclenché API)."""
    now = timezone.now()
    resultat = _executer_reglement_dette(dette, now=now, acteur=acteur)
    if resultat.statut == StatutReglementDette.SOLDE_INSUFFISANT:
        raise SoldeInsuffisantDetteError(solde=resultat.solde, montant_du=resultat.montant_du)
    return Transaction.objects.get(ref_transaction=resultat.ref_transaction)
