"""Catalogue de spécifications de notifications.

Ce module est volontairement dépourvu de tout I/O (pas d'ORM, pas de DRF) :
il ne fait que construire des objets `NotificationSpec` décrivant *quoi*
notifier, laissant au service applicatif (`NotificationService`) le soin de
décider *comment* et *si* la notification doit être persistée et envoyée.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import Optional


@dataclass(frozen=True)
class NotificationSpec:
    """Description pure d'une notification à émettre.

    `category`/`objet`/`contenu` sont les champs affichés à l'utilisateur ;
    `source_type`/`source_id` référencent l'objet métier à l'origine de la
    notification (sans FK réelle, voir `Notifications.source_type`) ;
    `dedup_key`, si renseigné, rend l'émission idempotente (voir
    `NotificationRepository.get_or_create_by_dedup`).
    """

    category: str
    objet: str
    contenu: str
    source_type: str = ""
    source_id: Optional[int] = None
    dedup_key: Optional[str] = None


def spec_invitation_tontine(tontine_nom: str, tontine_id: int) -> NotificationSpec:
    """Invitation à rejoindre une tontine de groupe."""
    return NotificationSpec(
        category="invitation",
        objet="Invitation à une tontine",
        contenu=f"Vous avez été invité(e) à rejoindre la tontine « {tontine_nom} ».",
        source_type="tontine",
        source_id=tontine_id,
    )


def spec_paiement_valide(
    kind: str,
    montant: Decimal,
    ref: str,
    source_type: str = "",
    source_id: Optional[int] = None,
) -> NotificationSpec:
    """Confirmation d'un mouvement financier réussi (dépôt, retrait, cotisation, versement...).

    `kind` est un libellé humain (ex: "cotisation", "dépôt", "retrait",
    "versement") utilisé tel quel dans le message, pas une valeur d'enum.
    """
    return NotificationSpec(
        category="paiement",
        objet=f"{kind.capitalize()} confirmé(e)",
        contenu=f"Votre {kind} de {montant} F a été confirmé(e) (réf. {ref}).",
        source_type=source_type,
        source_id=source_id,
    )


def spec_cotisation_a_venir(
    tontine_nom: str,
    tontine_id: int,
    tour_num: int,
    echeance: datetime,
) -> NotificationSpec:
    """Rappel de cotisation à venir (tour bientôt à échéance).

    Ne renseigne pas `dedup_key` ici : la clé d'idempotence doit être unique
    par (tontine, tour, destinataire) et le destinataire n'est pas connu de
    cette fonction pure — c'est à l'appelant (management command) de la
    construire, ex. via `dataclasses.replace(spec, dedup_key=...)`.
    """
    return NotificationSpec(
        category="cotisation",
        objet="Cotisation à venir",
        contenu=(
            f"Votre cotisation pour le tour {tour_num} de la tontine « {tontine_nom} » "
            f"est attendue avant le {echeance:%d/%m/%Y %H:%M}."
        ),
        source_type="tontine",
        source_id=tontine_id,
    )


def spec_cotisation_jour_j(
    tontine_nom: str, tontine_id: int, tour_num: int
) -> NotificationSpec:
    """Rappel le jour même de l'échéance (jour J)."""
    return NotificationSpec(
        category="cotisation",
        objet="Cotisation attendue aujourd'hui",
        contenu=(
            f"Votre cotisation pour le tour {tour_num} de la tontine « {tontine_nom} » "
            "est attendue aujourd'hui."
        ),
        source_type="tontine",
        source_id=tontine_id,
    )


def spec_cotisation_retard(
    tontine_nom: str, tontine_id: int, tour_num: int, montant_penalite: Optional[Decimal] = None
) -> NotificationSpec:
    """Alerte de retard de cotisation.

    Mentionne EXPLICITEMENT le risque de pénalité (règle 1 : chaque relance
    doit citer ce risque) — avec le montant exact de la pénalité applicable
    quand il est connu, plutôt qu'une formule vague.
    """
    if montant_penalite:
        risque = (
            f"Une pénalité de {montant_penalite} F pourra être appliquée si le "
            "retard persiste."
        )
    else:
        risque = "Un retard peut entraîner une pénalité selon le règlement de la tontine."
    return NotificationSpec(
        category="cotisation",
        objet="Cotisation en retard",
        contenu=(
            f"Votre paiement pour la tontine « {tontine_nom} » (tour {tour_num}) "
            f"n'a pas encore été reçu. {risque}"
        ),
        source_type="tontine",
        source_id=tontine_id,
    )


def spec_cotisation_relance(
    tontine_nom: str,
    tontine_id: int,
    tour_num: int,
    numero_relance: int,
    montant_penalite: Optional[Decimal] = None,
) -> NotificationSpec:
    """Relance de retard de cotisation (règle 1 — cycles/alertes/relances).

    Chaque relance (au plus `apps.tontine.scheduling.MAX_RETARD_RELANCES`)
    DOIT mentionner explicitement le risque de pénalité de retard : c'est le
    cœur de cette spec, distincte de `spec_cotisation_retard` (alerte
    ponctuelle) par son numéro d'ordre et son ton plus insistant à
    l'approche de la clôture.
    """
    if montant_penalite:
        risque = (
            f"Passé ce délai, une pénalité de {montant_penalite} F sera "
            "constatée à la clôture du tour."
        )
    else:
        risque = "Passé ce délai, une pénalité pourra être constatée à la clôture du tour."
    return NotificationSpec(
        category="cotisation",
        objet=f"Relance {numero_relance} : cotisation toujours en retard",
        contenu=(
            f"Rappel ({numero_relance}) : votre cotisation pour le tour {tour_num} de "
            f"la tontine « {tontine_nom} » est toujours en attente. {risque}"
        ),
        source_type="tontine",
        source_id=tontine_id,
    )


def spec_epargne_palier(
    nom_projet: str, epargne_id: int, seuil: int
) -> NotificationSpec:
    """Notification de progression d'un objectif d'épargne personnelle.

    `seuil` est un pourcentage entier (50, 80 ou 100).
    """
    if seuil >= 100:
        objet = "Objectif d'épargne atteint"
        contenu = f"Bravo ! Votre objectif d'épargne « {nom_projet} » est atteint à 100 %."
    else:
        objet = "Progression de votre épargne"
        contenu = f"Votre objectif d'épargne « {nom_projet} » a atteint {seuil} % de son montant cible."
    return NotificationSpec(
        category="epargne",
        objet=objet,
        contenu=contenu,
        source_type="savings",
        source_id=epargne_id,
    )


def spec_membre_exclu(tontine_nom: str, tontine_id: int, motif: str = "") -> NotificationSpec:
    """Notifie le membre lui-même qu'il vient d'être exclu du groupe."""
    contenu = f"Vous avez été retiré(e) du groupe « {tontine_nom} »."
    if motif:
        contenu += f" Motif : {motif}."
    return NotificationSpec(
        category="gestion",
        objet="Retrait du groupe",
        contenu=contenu,
        source_type="tontine",
        source_id=tontine_id,
    )


def spec_membre_exclu_annonce(tontine_nom: str, tontine_id: int, membre_nom: str) -> NotificationSpec:
    """Notifie les autres membres actifs qu'un membre a été exclu du groupe."""
    return NotificationSpec(
        category="gestion",
        objet="Membre retiré du groupe",
        contenu=f"{membre_nom} a été retiré(e) du groupe « {tontine_nom} ».",
        source_type="tontine",
        source_id=tontine_id,
    )


def spec_role_modifie(tontine_nom: str, tontine_id: int, nouveau_role: str) -> NotificationSpec:
    """Notifie un membre d'une promotion/rétrogradation de rôle."""
    libelle = "administrateur" if nouveau_role == "ADMINISTRATEUR" else "participant"
    return NotificationSpec(
        category="gestion",
        objet="Rôle mis à jour",
        contenu=f"Votre rôle dans le groupe « {tontine_nom} » est désormais : {libelle}.",
        source_type="tontine",
        source_id=tontine_id,
    )


def spec_regles_modifiees(tontine_nom: str, tontine_id: int, champs_modifies: list) -> NotificationSpec:
    """Notifie un membre actif que les règles du groupe ont changé (ré-acceptation requise)."""
    libelles = ", ".join(champs_modifies) if champs_modifies else "les règles"
    return NotificationSpec(
        category="gestion",
        objet="Règles du groupe modifiées",
        contenu=(
            f"Les règles du groupe « {tontine_nom} » ont été modifiées ({libelles}). "
            "Merci de les consulter et de les accepter à nouveau si nécessaire."
        ),
        source_type="tontine",
        source_id=tontine_id,
    )


def spec_penalite_attribuee(
    tontine_nom: str, tontine_id: int, montant, type_penalite: str
) -> NotificationSpec:
    """Notifie un membre qu'une pénalité vient de lui être attribuée."""
    return NotificationSpec(
        category="cotisation",
        objet="Pénalité attribuée",
        contenu=(
            f"Une pénalité de {montant} F ({type_penalite.lower()}) vous a été attribuée "
            f"dans le groupe « {tontine_nom} »."
        ),
        source_type="tontine",
        source_id=tontine_id,
    )


def spec_penalite_reglee(tontine_nom: str, tontine_id: int, montant) -> NotificationSpec:
    """Notifie un membre que sa pénalité a été marquée réglée par l'admin."""
    return NotificationSpec(
        category="cotisation",
        objet="Pénalité réglée",
        contenu=f"Votre pénalité de {montant} F dans le groupe « {tontine_nom} » a été réglée.",
        source_type="tontine",
        source_id=tontine_id,
    )


def spec_penalite_annulee(tontine_nom: str, tontine_id: int, montant) -> NotificationSpec:
    """Notifie un membre qu'une pénalité qui lui avait été attribuée a été annulée."""
    return NotificationSpec(
        category="cotisation",
        objet="Pénalité annulée",
        contenu=f"Votre pénalité de {montant} F dans le groupe « {tontine_nom} » a été annulée.",
        source_type="tontine",
        source_id=tontine_id,
    )


def spec_penalite_auto_constatee(
    tontine_nom: str, tontine_id: int, montant, tour_num: int
) -> NotificationSpec:
    """Notifie un membre qu'une pénalité de retard a été constatée automatiquement
    (job `apply_tontine_penalties`, phase constat), avant toute tentative de débit."""
    return NotificationSpec(
        category="cotisation",
        objet="Pénalité de retard constatée",
        contenu=(
            f"Une pénalité de {montant} F vous a été attribuée automatiquement pour "
            f"retard de cotisation (tour {tour_num}) dans le groupe « {tontine_nom} »."
        ),
        source_type="tontine",
        source_id=tontine_id,
    )


def spec_penalite_prelevee(tontine_nom: str, tontine_id: int, montant, ref: str) -> NotificationSpec:
    """Notifie un membre que sa pénalité a été prélevée avec succès sur son wallet."""
    return NotificationSpec(
        category="cotisation",
        objet="Pénalité prélevée",
        contenu=(
            f"Votre pénalité de {montant} F dans le groupe « {tontine_nom} » a été "
            f"prélevée sur votre solde (réf. {ref})."
        ),
        source_type="tontine",
        source_id=tontine_id,
    )


def spec_penalite_impayee_solde_insuffisant(
    tontine_nom: str, tontine_id: int, montant_due, solde
) -> NotificationSpec:
    """Alerte : tentative de prélèvement automatique échouée (solde insuffisant).

    Plafonnée à une notification par semaine ISO (voir
    `domain.dedup.dedup_penalite_solde_insuffisant`) : le job de recouvrement
    tourne 24×/jour, un envoi à chaque tentative harcèlerait l'utilisateur.
    """
    return NotificationSpec(
        category="cotisation",
        objet="Pénalité impayée : solde insuffisant",
        contenu=(
            f"Votre pénalité de {montant_due} F dans le groupe « {tontine_nom} » n'a pas "
            f"pu être prélevée (solde actuel : {solde} F). Rechargez votre portefeuille "
            "pour régulariser."
        ),
        source_type="tontine",
        source_id=tontine_id,
    )


def spec_penalite_plafond_atteint(
    tontine_nom: str, tontine_id: int, membre_nom: str, total_impaye
) -> NotificationSpec:
    """Notifie l'hôte/admin qu'un membre a atteint le plafond de dette de pénalités.

    Destinée à un administrateur (escalade humaine) : le job de constat
    automatique cesse de générer de nouvelles pénalités pour ce membre tant
    que la situation n'a pas été régularisée manuellement.
    """
    return NotificationSpec(
        category="gestion",
        objet="Plafond de dette de pénalités atteint",
        contenu=(
            f"{membre_nom} a atteint le plafond de dette de pénalités impayées "
            f"({total_impaye} F) dans le groupe « {tontine_nom} ». Le constat automatique "
            "de nouvelles pénalités est suspendu pour ce membre : une intervention "
            "manuelle est nécessaire."
        ),
        source_type="tontine",
        source_id=tontine_id,
    )


def spec_pot_partiel_recu(
    tontine_nom: str, tontine_id: int, tour_num: int, montant_verse: Decimal, montant_attendu: Decimal
) -> NotificationSpec:
    """Notifie le bénéficiaire d'un tour clôturé AVEC IMPAYÉS qu'il a reçu un
    POT PARTIEL (montant réellement collecté, jamais bloqué par les impayés)."""
    return NotificationSpec(
        category="cotisation",
        objet="Pot partiel reçu",
        contenu=(
            f"Votre tour ({tour_num}) dans la tontine « {tontine_nom} » a été "
            f"clôturé avec des impayés. Vous avez reçu {montant_verse} F sur "
            f"{montant_attendu} F attendus. Les membres en retard restent "
            "redevables : vous serez crédité automatiquement à leur règlement."
        ),
        source_type="tontine",
        source_id=tontine_id,
    )


def spec_dette_cotisation_constatee(
    tontine_nom: str, tontine_id: int, tour_num: int, montant: Decimal
) -> NotificationSpec:
    """Notifie un membre qu'une dette de cotisation manquée (distincte d'une
    pénalité) vient de lui être constatée à la clôture forcée d'un tour."""
    return NotificationSpec(
        category="cotisation",
        objet="Cotisation manquée constatée",
        contenu=(
            f"Le tour {tour_num} de la tontine « {tontine_nom} » a été clôturé "
            f"sans que vous ayez cotisé. Une dette de {montant} F reste à "
            "régler au bénéficiaire concerné."
        ),
        source_type="tontine",
        source_id=tontine_id,
    )


def spec_dette_cotisation_reglee(tontine_nom: str, tontine_id: int, montant: Decimal) -> NotificationSpec:
    """Notifie un débiteur que sa dette de cotisation manquée a été réglée."""
    return NotificationSpec(
        category="cotisation",
        objet="Dette de cotisation réglée",
        contenu=(
            f"Votre dette de cotisation manquée de {montant} F dans le groupe "
            f"« {tontine_nom} » a été réglée."
        ),
        source_type="tontine",
        source_id=tontine_id,
    )


def spec_compensation_appliquee(
    tontine_nom: str, tontine_id: int, tour_num: int, montant_compense: Decimal
) -> NotificationSpec:
    """Notifie un bénéficiaire que ses propres créances impayées (dettes de
    cotisation et/ou pénalités antérieures) ont été automatiquement
    compensées sur le pot de son propre tour, avant versement du solde net."""
    return NotificationSpec(
        category="cotisation",
        objet="Compensation appliquée sur votre versement",
        contenu=(
            f"{montant_compense} F de vos dettes/pénalités en cours ont été "
            f"automatiquement compensés sur le pot de votre tour ({tour_num}) "
            f"dans la tontine « {tontine_nom} », avant versement du solde net."
        ),
        source_type="tontine",
        source_id=tontine_id,
    )


def spec_securite_connexion(ip: Optional[str], when: datetime) -> NotificationSpec:
    """Alerte de sécurité : nouvelle connexion réussie."""
    ip_display = ip or "adresse IP inconnue"
    return NotificationSpec(
        category="securite",
        objet="Nouvelle connexion à votre compte",
        contenu=f"Une connexion a été effectuée depuis {ip_display} le {when:%d/%m/%Y %H:%M}.",
        source_type="auth",
    )
