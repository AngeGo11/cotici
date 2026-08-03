"""Fabrique centralisée des `dedup_key` de notifications.

Format versionné : `v1:<domaine>:<evenement>:<scope>:<bucket>`. Le préfixe de
version permet de faire évoluer le format sans risquer de collision avec des
clés déjà en base (une v2 ne "rencontrera" jamais une v1).

Module pur (zéro I/O), comme le reste de `domain/` : les appelants
(management commands, services) lui fournissent des identifiants déjà résolus.
"""
from __future__ import annotations

from datetime import date


def dedup_cotisation_rappel(*, tour_id: int, user_id: int, offset_label: str) -> str:
    """Rappel de cotisation à venir, avant échéance.

    `offset_label` est un libellé court de l'offset (ex: "J2", "J1", "J0").
    """
    return f"v1:tontine:cotisation.rappel:tour={tour_id}:user={user_id}:offset={offset_label}"


def dedup_cotisation_retard(*, tour_id: int, user_id: int, local_date: date) -> str:
    """Alerte de retard de cotisation.

    Bucket = date LOCALE (Abidjan, UTC+0 sans DST) et non UTC : le job tourne
    une fois par jour à heure fixe locale, un bucket en UTC décalerait la
    fenêtre de dédoublonnage d'une notification par rapport à l'intention
    métier ("un rappel de retard par jour calendaire local").
    """
    return f"v1:tontine:cotisation.retard:tour={tour_id}:user={user_id}:d={local_date.isoformat()}"


def dedup_penalite_auto(*, tour_id: int, user_id: int) -> str:
    """Constat automatique d'une pénalité de retard (une fois par tour+membre).

    Contrairement à `dedup_cotisation_retard`, pas de bucket temporel : la
    contrainte DB `uniq_penalite_auto_par_tour_et_user` garantit déjà qu'une
    seule `Penalite` automatique existe par (tour, user) — cette dedup_key
    sert uniquement à éviter une notification en double si `constater_penalite`
    était rappelée après un retry réseau sur la même pénalité déjà notifiée.
    """
    return f"v1:tontine:penalite.auto:tour={tour_id}:user={user_id}"


def dedup_penalite_solde_insuffisant(*, penalite_id: int, iso_year: int, iso_week: int) -> str:
    """Alerte de solde insuffisant lors d'une tentative de prélèvement automatique.

    Bucket = semaine ISO (et non jour) : le job de recouvrement
    (`apply_tontine_penalties`) tourne jusqu'à 24×/jour, un bucket journalier
    produirait jusqu'à 7 notifications par semaine pour la même dette
    (harcèlement) là où une par semaine suffit à relancer l'utilisateur.
    """
    return f"v1:tontine:penalite.impayee:pen={penalite_id}:w={iso_year}-{iso_week:02d}"


def dedup_cotisation_relance(*, tour_id: int, user_id: int, numero_relance: int) -> str:
    """Relance de retard de cotisation (règle 1) : une fois par (tour, user,
    numéro de relance) — jamais plus de `MAX_RETARD_RELANCES` relances."""
    return f"v1:tontine:cotisation.relance:tour={tour_id}:user={user_id}:n={numero_relance}"


def dedup_pot_partiel_recu(*, tour_id: int) -> str:
    """Pot partiel versé au bénéficiaire d'un tour clôturé avec impayés — un
    seul événement par tour (la clôture forcée elle-même est idempotente)."""
    return f"v1:tontine:pot_partiel:tour={tour_id}"


def dedup_dette_cotisation_constatee(*, dette_id: int) -> str:
    """Constat d'une dette de cotisation manquée — un seul événement par dette
    (la dette elle-même est unique par (tour, debiteur), voir la contrainte DB)."""
    return f"v1:tontine:dette.constatee:dette={dette_id}"


def dedup_compensation_appliquee(*, tour_id: int, user_id: int) -> str:
    """Compensation appliquée sur le pot d'un bénéficiaire à la clôture de
    SON tour — un seul événement par (tour, bénéficiaire)."""
    return f"v1:tontine:compensation:tour={tour_id}:user={user_id}"


def dedup_epargne_palier(*, epargne_id: int, seuil: int) -> str:
    """Palier de progression d'épargne personnelle atteint (50/80/100 %).

    Un seul événement par (épargne, seuil) sur toute la durée de vie de
    l'objectif : anti-oscillation, un palier franchi puis re-franchi après un
    retrait ne renotifie pas.
    """
    return f"v1:savings:palier:epargne={epargne_id}:seuil={seuil}"
