"""Couche I/O transactionnelle des pénalités de retard de tontine.

**Source de vérité UNIQUE du débit d'une pénalité** : que le déclencheur soit
le job de recouvrement automatique (`apply_tontine_penalties`) ou l'action
d'un admin/hôte via l'API (`regler_penalite` en mode `"wallet"`), le débit
passe toujours par `_executer_prelevement` — il ne doit JAMAIS exister deux
chemins de code qui débitent un wallet pour régler une pénalité.

Ordre canonique des verrous, imposé par `apps.tontine.views.cotiser_tontine`
(`Wallet` L1408 puis `TourTontine` L1432) : **Wallet → TourTontine → Penalite**.
Toute inversion crée un risque de deadlock sous charge concurrente. Ce module
généralise cet ordre aux opérations à deux wallets (prélèvement avec
versement au bénéficiaire, remboursement) en verrouillant systématiquement
dans l'ordre : Wallet du membre fautif → TourTontine → Wallet du bénéficiaire
du tour → Penalite. `changer_tour` verrouille déjà Tour puis Wallet(bénéficiaire)
dans cet ordre relatif ; ce module ne fait qu'y préfixer le verrou sur le
wallet du fautif et suffixer le verrou sur la pénalité elle-même.
"""
from __future__ import annotations

import dataclasses
from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import Optional

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.audits.models import AuditLog
from apps.notifications.domain.catalog import (
    spec_penalite_annulee,
    spec_penalite_auto_constatee,
    spec_penalite_impayee_solde_insuffisant,
    spec_penalite_plafond_atteint,
    spec_penalite_prelevee,
    spec_penalite_reglee,
)
from apps.notifications.domain.dedup import dedup_penalite_auto, dedup_penalite_solde_insuffisant
from apps.notifications.services.notification_service import NotificationService
from apps.tontine.helpers import active_members_ordered, display_name, display_name_user
from apps.tontine.models import Penalite, TourTontine
from apps.tontine.penalties import (
    est_en_retard,
    montant_penalite_pour,
    penalites_auto_actives,
    plafond_dette_atteint,
    reserve_cotisation,
)
from apps.utils.utilitaires import _unique_ref
from apps.wallet.models import Transaction, Wallet


# ---------------------------------------------------------------------------
# Exceptions métier — traduites en réponses HTTP par les vues appelantes.
# ---------------------------------------------------------------------------


class PenaliteDejaTraiteeError(Exception):
    """La pénalité est déjà réglée ou annulée : plus rien à faire."""

    def __init__(self, penalite_id: int):
        self.penalite_id = penalite_id
        super().__init__(f"Pénalité {penalite_id} déjà réglée ou annulée.")


class SoldeInsuffisantError(Exception):
    """Le wallet du membre fautif n'a pas les fonds nécessaires (+ réserve de cotisation)."""

    def __init__(self, *, solde: Decimal, montant_due: Decimal):
        self.solde = solde
        self.montant_due = montant_due
        super().__init__(f"Solde insuffisant ({solde} F) pour régler {montant_due} F.")


class RemboursementImpossibleError(Exception):
    """Le wallet du bénéficiaire du tour n'a plus les fonds à restituer (déjà retirés)."""

    def __init__(self, *, solde: Decimal, montant_manquant: Decimal):
        self.solde = solde
        self.montant_manquant = montant_manquant
        super().__init__(
            f"Remboursement impossible : il manque {montant_manquant} F "
            f"sur le wallet du bénéficiaire (solde actuel {solde} F)."
        )


class PenaliteSansTourError(ValueError):
    """Une pénalité sans `tour` associé n'a pas de bénéficiaire identifiable."""


# ---------------------------------------------------------------------------
# Résultat du prélèvement (job automatique) — jamais d'exception pour le cas
# "solde insuffisant", qui est un résultat normal et attendu du job.
# ---------------------------------------------------------------------------


class StatutPrelevement(str, Enum):
    REGLEE = "reglee"
    DEJA_TRAITEE = "deja_traitee"
    SOLDE_INSUFFISANT = "solde_insuffisant"


@dataclass(frozen=True)
class ResultatPrelevement:
    statut: StatutPrelevement
    penalite_id: int
    solde: Optional[Decimal] = None
    montant_due: Optional[Decimal] = None
    ref_transaction: Optional[str] = None


def _notifier_solde_insuffisant(penalite: Penalite, *, solde: Decimal, now: datetime) -> None:
    iso_year, iso_week, _ = now.isocalendar()
    spec = spec_penalite_impayee_solde_insuffisant(
        tontine_nom=display_name(penalite.tontine),
        tontine_id=penalite.tontine_id,
        montant_due=penalite.montant_due,
        solde=solde,
    )
    spec = dataclasses.replace(
        spec,
        dedup_key=dedup_penalite_solde_insuffisant(
            penalite_id=penalite.pk, iso_year=iso_year, iso_week=iso_week
        ),
    )
    NotificationService.emit_idempotent(destinataire=penalite.user, spec=spec)


def _executer_prelevement(
    penalite: Penalite, *, now: datetime, acteur=None
) -> ResultatPrelevement:
    """Cœur transactionnel unique du débit d'une pénalité (voir docstring de module).

    `penalite` peut être une instance non verrouillée (lecture antérieure) :
    seuls ses identifiants FK immuables (`user_id`, `tour_id`, `pk`) sont
    utilisés pour acquérir les verrous ; tous les champs mutables sont relus
    sous verrou avant toute décision.
    """
    if not penalite.tour_id:
        raise PenaliteSansTourError(
            "Impossible de débiter une pénalité sans tour associé (bénéficiaire inconnu)."
        )

    with transaction.atomic():
        fautif_wallet, _ = Wallet.objects.select_for_update().get_or_create(
            user_id=penalite.user_id
        )
        # NB : pas de `select_related("tontine__tontineregle")` ici — c'est une
        # relation OneToOne inverse (donc potentiellement un LEFT OUTER JOIN
        # côté nullable), que PostgreSQL refuse de combiner avec `FOR UPDATE`
        # (`FeatureNotSupported`). `regle` est chargée séparément juste après
        # (requête simple, hors verrou composite).
        tour = (
            TourTontine.objects.select_for_update().select_related("tontine").get(pk=penalite.tour_id)
        )
        # Auto-pénalisation (le bénéficiaire du tour est aussi son propre
        # payeur en retard, cas courant en rang 1) : `fautif_wallet` et
        # `benef_wallet` DOIVENT être la MÊME instance Python. Deux
        # `SELECT ... FOR UPDATE` séparés sur la même ligne renverraient deux
        # objets porteurs chacun du solde lu AVANT toute mutation ; la
        # deuxième `.save()` écraserait alors la première (lost update) et
        # créditerait le montant sans jamais avoir réellement débité —
        # fabrication de monnaie. Réutiliser l'instance déjà verrouillée
        # élimine le problème par construction (une seule lecture, un seul
        # solde, deux mutations appliquées en séquence dessus).
        if tour.user_id == penalite.user_id:
            benef_wallet = fautif_wallet
        else:
            benef_wallet, _ = Wallet.objects.select_for_update().get_or_create(user_id=tour.user_id)
        p = Penalite.objects.select_for_update().select_related("user", "tontine").get(pk=penalite.pk)

        if p.est_reglee or p.est_annulee:
            raise PenaliteDejaTraiteeError(p.pk)

        regle = tour.tontine.tontineregle
        a_deja_cotise = (
            tour.statut_tour != TourTontine.STATUT_TOUR.EN_COURS
            or Transaction.objects.filter(
                tour=tour,
                tontine=tour.tontine,
                wallet__user_id=p.user_id,
                type_transaction=Transaction.TYPE_TRANSACTION.DEBIT,
                statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
            ).exists()
        )
        reserve = reserve_cotisation(regle, a_deja_cotise)
        montant = p.montant_due

        if fautif_wallet.solde_courant < montant + reserve:
            # Encaissement tout-ou-rien : on ne débite jamais un montant partiel.
            # La tentative est comptabilisée (observabilité + anti-thrashing du
            # job) mais rien n'est déplacé — la transaction commite quand même
            # (ce n'est pas une exception : c'est un résultat normal du job).
            p.nombre_tentatives += 1
            p.date_derniere_tentative = now
            p.save(update_fields=["nombre_tentatives", "date_derniere_tentative"])
            solde_constate = fautif_wallet.solde_courant
            resultat = ResultatPrelevement(
                statut=StatutPrelevement.SOLDE_INSUFFISANT,
                penalite_id=p.pk,
                solde=solde_constate,
                montant_due=montant,
            )
        else:
            fautif_wallet.solde_courant -= montant
            fautif_wallet.save(update_fields=["solde_courant"])
            ref_debit = _unique_ref("PEN")
            Transaction.objects.create(
                wallet=fautif_wallet,
                tontine=tour.tontine,
                tour=tour,
                solde_courant=fautif_wallet.solde_courant,
                ref_transaction=ref_debit,
                client_ref=f"pen:{p.pk}",
                mode_de_paiement=Transaction.MODE_DE_PAIEMENT.SOLDE_COTICI,
                montant_transaction=montant,
                statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
                type_transaction=Transaction.TYPE_TRANSACTION.PENALITE,
            )

            # Le bénéficiaire du tour, jamais la plateforme : norme tontinière
            # (la pénalité compense la communauté), et capter les pénalités
            # exposerait COTICI à une requalification réglementaire (frais non
            # contractualisés). `tour.montant_depose` n'est JAMAIS incrémenté ici
            # : c'est un snapshot strict des cotisations, et le tour est souvent
            # déjà TERMINÉ au moment du recouvrement.
            benef_wallet.solde_courant += montant
            benef_wallet.save(update_fields=["solde_courant"])
            ref_credit = _unique_ref("VPE")
            Transaction.objects.create(
                wallet=benef_wallet,
                tontine=tour.tontine,
                tour=tour,
                solde_courant=benef_wallet.solde_courant,
                ref_transaction=ref_credit,
                client_ref=f"penv:{p.pk}",
                mode_de_paiement=Transaction.MODE_DE_PAIEMENT.SOLDE_COTICI,
                montant_transaction=montant,
                statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
                type_transaction=Transaction.TYPE_TRANSACTION.VERSEMENT_PENALITE,
            )

            p.est_reglee = True
            p.date_reglement_penalite = now
            p.montant_due = Decimal("0")
            p.ref_transaction_reglement = ref_debit
            p.nombre_tentatives += 1
            p.date_derniere_tentative = now
            p.save(
                update_fields=[
                    "est_reglee",
                    "date_reglement_penalite",
                    "montant_due",
                    "ref_transaction_reglement",
                    "nombre_tentatives",
                    "date_derniere_tentative",
                ]
            )

            AuditLog.objects.create(
                user=acteur,
                user_display=(
                    display_name_user(acteur) if acteur else "système (apply_tontine_penalties)"
                ),
                action=AuditLog.Action.PENALTY_PAID,
                resource=(
                    f"tontine:{tour.tontine_id}:membre:{p.user_id}:tour:{tour.id}:"
                    f"penalite:{p.pk}:montant={montant}"
                    + (":auto=1" if acteur is None else "")
                ),
                status=AuditLog.Status.SUCCESS,
            )
            resultat = ResultatPrelevement(
                statut=StatutPrelevement.REGLEE,
                penalite_id=p.pk,
                ref_transaction=ref_debit,
            )

    # Notifications émises hors verrou (mais toujours dans le savepoint imbriqué
    # de `NotificationService.emit*`, voir sa docstring) : ne doivent jamais
    # invalider le débit déjà commité ci-dessus.
    if resultat.statut == StatutPrelevement.SOLDE_INSUFFISANT:
        _notifier_solde_insuffisant(p, solde=resultat.solde, now=now)
    elif resultat.statut == StatutPrelevement.REGLEE:
        NotificationService.emit(
            destinataire=p.user,
            spec=spec_penalite_prelevee(
                tontine_nom=display_name(p.tontine),
                tontine_id=p.tontine_id,
                montant=montant,
                ref=resultat.ref_transaction,
            ),
        )

    return resultat


def tenter_prelevement(penalite: Penalite, *, now: datetime) -> ResultatPrelevement:
    """Tentative de prélèvement automatique (appelée par le job de recouvrement).

    Ne lève jamais d'exception pour un solde insuffisant (résultat normal du
    job, pas une erreur) ; lève `PenaliteDejaTraiteeError` si la pénalité a
    été traitée entre-temps (course avec une action admin concurrente) —
    l'appelant (job) doit l'attraper et passer à l'élément suivant.
    """
    return _executer_prelevement(penalite, now=now, acteur=None)


def regler_penalite_par_wallet(penalite: Penalite, acteur) -> Transaction:
    """Règlement d'une pénalité par débit réel du wallet du fautif (déclenché API).

    Lève `SoldeInsuffisantError` (solde, montant_due) ou `PenaliteDejaTraiteeError`
    — à charge de la vue de les traduire en réponse HTTP 400/409 explicite.
    """
    now = timezone.now()
    resultat = _executer_prelevement(penalite, now=now, acteur=acteur)
    if resultat.statut == StatutPrelevement.SOLDE_INSUFFISANT:
        raise SoldeInsuffisantError(solde=resultat.solde, montant_due=resultat.montant_due)
    return Transaction.objects.get(ref_transaction=resultat.ref_transaction)


def marquer_penalite_reglee_hors_app(penalite: Penalite, admin, motif: str) -> None:
    """Marque une pénalité réglée sans débit applicatif (règlement en espèces,
    comportement historique de `regler_penalite` avant la refonte)."""
    now = timezone.now()
    with transaction.atomic():
        p = (
            Penalite.objects.select_for_update()
            .select_related("tontine", "user")
            .get(pk=penalite.pk)
        )
        if p.est_annulee:
            raise PenaliteDejaTraiteeError(p.pk)
        if p.est_reglee:
            raise PenaliteDejaTraiteeError(p.pk)

        p.est_reglee = True
        p.date_reglement_penalite = now
        p.montant_due = Decimal("0")
        p.save(update_fields=["est_reglee", "date_reglement_penalite", "montant_due"])

        AuditLog.objects.create(
            user=admin,
            user_display=display_name_user(admin),
            action=AuditLog.Action.PENALTY_PAID,
            resource=(
                f"tontine:{p.tontine_id}:membre:{p.user_id}:penalite:{p.pk}:hors_application"
                + (f":motif={motif}" if motif else "")
            ),
            status=AuditLog.Status.SUCCESS,
        )
        NotificationService.emit(
            destinataire=p.user,
            spec=spec_penalite_reglee(
                tontine_nom=display_name(p.tontine), tontine_id=p.tontine_id, montant=p.montant_penalite
            ),
        )


def rembourser_penalite(penalite: Penalite, admin, motif: str) -> None:
    """Annule une pénalité DÉJÀ réglée en restituant les fonds au fautif.

    Appelée par `annuler_penalite` lorsque `penalite.est_reglee` est vrai : le
    débit ayant déjà eu lieu, une simple annulation logique laisserait le
    fautif lésé. Débite le wallet du bénéficiaire du tour (`tour.user`) du
    montant reçu et le recrédite au fautif — types de transaction réutilisés
    en sens inverse (`PENALITE`/`VERSEMENT_PENALITE`), `client_ref` préfixés
    `penr:`/`penrv:` pour les distinguer des mouvements d'origine (`pen:`/`penv:`).

    Lève `RemboursementImpossibleError` si le bénéficiaire n'a plus les fonds
    (déjà retirés) — à charge de l'admin de régulariser hors application.
    """
    if not motif:
        raise ValueError("Motif obligatoire pour un remboursement de pénalité.")
    if not penalite.tour_id:
        raise PenaliteSansTourError(
            "Impossible de rembourser une pénalité sans tour associé (bénéficiaire inconnu)."
        )

    now = timezone.now()
    with transaction.atomic():
        # Même ordre canonique que `_executer_prelevement` (Wallet fautif ->
        # Tour -> Wallet bénéficiaire -> Penalite), pour exclure tout deadlock
        # croisé avec un prélèvement concurrent sur la même pénalité/tour.
        fautif_wallet, _ = Wallet.objects.select_for_update().get_or_create(
            user_id=penalite.user_id
        )
        tour = (
            TourTontine.objects.select_for_update().select_related("tontine").get(pk=penalite.tour_id)
        )
        # Même garde qu'`_executer_prelevement` contre le lost update en cas
        # d'auto-pénalisation (fautif == bénéficiaire du tour) : voir sa
        # docstring pour le détail du bug que ceci évite.
        if tour.user_id == penalite.user_id:
            benef_wallet = fautif_wallet
        else:
            benef_wallet, _ = Wallet.objects.select_for_update().get_or_create(user_id=tour.user_id)
        p = (
            Penalite.objects.select_for_update()
            .select_related("tontine", "user")
            .get(pk=penalite.pk)
        )

        if not p.est_reglee:
            raise ValueError(
                "Cette pénalité n'a pas été réglée : utilisez l'annulation simple."
            )
        if p.est_annulee:
            raise PenaliteDejaTraiteeError(p.pk)

        montant = p.montant_penalite
        if benef_wallet.solde_courant < montant:
            raise RemboursementImpossibleError(
                solde=benef_wallet.solde_courant,
                montant_manquant=montant - benef_wallet.solde_courant,
            )

        benef_wallet.solde_courant -= montant
        benef_wallet.save(update_fields=["solde_courant"])
        Transaction.objects.create(
            wallet=benef_wallet,
            tontine=tour.tontine,
            tour=tour,
            solde_courant=benef_wallet.solde_courant,
            ref_transaction=_unique_ref("VPE"),
            client_ref=f"penrv:{p.pk}",
            mode_de_paiement=Transaction.MODE_DE_PAIEMENT.SOLDE_COTICI,
            montant_transaction=montant,
            statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
            type_transaction=Transaction.TYPE_TRANSACTION.VERSEMENT_PENALITE,
        )

        fautif_wallet.solde_courant += montant
        fautif_wallet.save(update_fields=["solde_courant"])
        Transaction.objects.create(
            wallet=fautif_wallet,
            tontine=tour.tontine,
            tour=tour,
            solde_courant=fautif_wallet.solde_courant,
            ref_transaction=_unique_ref("PEN"),
            client_ref=f"penr:{p.pk}",
            mode_de_paiement=Transaction.MODE_DE_PAIEMENT.SOLDE_COTICI,
            montant_transaction=montant,
            statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
            type_transaction=Transaction.TYPE_TRANSACTION.PENALITE,
        )

        # `est_reglee` redevient False : la contrainte DB
        # `penalite_reglee_xor_annulee` interdit qu'une pénalité soit à la
        # fois réglée ET annulée, et le remboursement vient précisément
        # d'annuler l'effet du règlement (l'argent a été restitué).
        p.est_reglee = False
        p.est_annulee = True
        p.date_annulation = now
        p.motif = motif
        p.save(update_fields=["est_reglee", "est_annulee", "date_annulation", "motif"])

        AuditLog.objects.create(
            user=admin,
            user_display=display_name_user(admin),
            action=AuditLog.Action.PENALTY_CANCELLED,
            resource=(
                f"tontine:{p.tontine_id}:membre:{p.user_id}:penalite:{p.pk}:"
                f"rembourse:motif={motif}"
            ),
            status=AuditLog.Status.SUCCESS,
        )
        NotificationService.emit(
            destinataire=p.user,
            spec=spec_penalite_annulee(
                tontine_nom=display_name(p.tontine), tontine_id=p.tontine_id, montant=montant
            ),
        )


# ---------------------------------------------------------------------------
# Constat (phase 1 du job de recouvrement) — aucun wallet touché ici.
# ---------------------------------------------------------------------------


def constater_penalite(
    tour: TourTontine, user, regle, *, now: datetime
) -> Optional[Penalite]:
    """Constate (crée) une pénalité automatique pour le payeur courant de `tour`.

    Retourne `None` sans effet de bord si l'une des conditions suivantes n'est
    pas réunie : le tour n'est plus EN_COURS, `user` n'est plus (ou pas
    encore) le payeur courant, le retard n'est pas constitué, les garde-fous
    d'activation (`apps.tontine.penalties.penalites_auto_actives`) ne sont pas
    réunis, le plafond de dette de l'utilisateur est atteint, ou une pénalité
    automatique existe déjà pour ce (tour, user) (idempotence, voir la
    contrainte `uniq_penalite_auto_par_tour_et_user`).

    Ordre des verrous : TourTontine -> Penalite (sous-ensemble de l'ordre
    canonique global : aucun wallet n'est touché lors du simple constat).
    """
    from django.conf import settings

    cutoff = getattr(settings, "PENALITES_AUTO_CUTOFF", None)
    if not penalites_auto_actives(regle, tour, now, cutoff):
        return None

    with transaction.atomic():
        tour_locked = (
            TourTontine.objects.select_for_update().select_related("tontine").get(pk=tour.pk)
        )
        if tour_locked.statut_tour != TourTontine.STATUT_TOUR.EN_COURS:
            return None

        membres = active_members_ordered(tour_locked.tontine)
        debit_dates = dict(
            Transaction.objects.filter(
                tour=tour_locked,
                tontine=tour_locked.tontine,
                type_transaction=Transaction.TYPE_TRANSACTION.DEBIT,
                statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
            ).values_list("wallet__user_id", "date_transaction")
        )

        payeur_courant = None
        devenu_payeur_at = tour_locked.date
        for index, tm in enumerate(membres):
            if tm.membre_id in debit_dates:
                continue
            payeur_courant = tm
            if index > 0:
                precedent = membres[index - 1]
                devenu_payeur_at = debit_dates.get(precedent.membre_id, tour_locked.date)
            break

        if payeur_courant is None or payeur_courant.membre_id != user.id:
            # Ce n'est plus (ou pas encore) le payeur courant : quelqu'un a
            # cotisé entre le moment où le job a listé les candidats et
            # l'acquisition du verrou, ou `user` n'a jamais été le payeur
            # courant (appel erroné) — rien à constater.
            return None

        if not est_en_retard(regle, tour_locked, devenu_payeur_at, now):
            return None

        total_impaye = Penalite.objects.filter(
            tontine_id=tour_locked.tontine_id, user=user, est_reglee=False, est_annulee=False
        ).aggregate(total=Sum("montant_due"))["total"] or Decimal("0")
        if plafond_dette_atteint(regle, total_impaye):
            # Escalade humaine : pas de nouvelle pénalité auto tant qu'un admin
            # n'a pas régularisé. Notification non-idempotente assumée (pas de
            # dedup_key dédiée dans la spec) : le job ne re-tentera le constat
            # qu'au prochain passage, et le plafond reste franchi tant que la
            # dette n'a pas diminué — un léger risque de répétition, documenté
            # ici plutôt que silencieusement ignoré.
            NotificationService.emit(
                destinataire=tour_locked.tontine.hote,
                spec=spec_penalite_plafond_atteint(
                    tontine_nom=display_name(tour_locked.tontine),
                    tontine_id=tour_locked.tontine_id,
                    membre_nom=display_name_user(user),
                    total_impaye=total_impaye,
                ),
            )
            return None

        penalite, created = Penalite.objects.get_or_create(
            tour=tour_locked,
            user=user,
            est_automatique=True,
            defaults={
                "tontine": tour_locked.tontine,
                "montant_penalite": montant_penalite_pour(regle),
                "montant_due": montant_penalite_pour(regle),
                "type_penalite": Penalite.TYPE_PENALITE.RETARD_PAIEMENT,
                "motif": f"Pénalité automatique de retard (tour {tour_locked.numero_du_tour}).",
            },
        )
        if not created:
            return None

        AuditLog.objects.create(
            user=None,
            user_display="système (apply_tontine_penalties)",
            action=AuditLog.Action.PENALTY_ASSIGNED,
            resource=(
                f"tontine:{tour_locked.tontine_id}:membre:{user.id}:tour:{tour_locked.id}:"
                f"penalite:{penalite.pk}:montant={penalite.montant_penalite}:auto=1"
            ),
            status=AuditLog.Status.SUCCESS,
        )

    spec = spec_penalite_auto_constatee(
        tontine_nom=display_name(tour_locked.tontine),
        tontine_id=tour_locked.tontine_id,
        montant=penalite.montant_penalite,
        tour_num=tour_locked.numero_du_tour,
    )
    spec = dataclasses.replace(
        spec, dedup_key=dedup_penalite_auto(tour_id=tour_locked.id, user_id=user.id)
    )
    NotificationService.emit_idempotent(destinataire=user, spec=spec)

    return penalite
