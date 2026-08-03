"""État UX et sérialisation des tontines de groupe."""

from __future__ import annotations

import math
from decimal import Decimal
from typing import Optional

from apps.tontine.models import (
    Chat,
    Invitations,
    Tontine,
    TontineMembre,
    TontineRegle,
    TourTontine,
)


def compute_nombre_tours(objectif_total: int, montant_cotisation: int, nombre_max: int) -> int:
    """Nombre de tours = objectif total / (mise × participants), arrondi au supérieur."""
    pot_par_tour = montant_cotisation * nombre_max
    if pot_par_tour <= 0:
        raise ValueError("Pot par tour invalide.")
    return max(1, math.ceil(objectif_total / pot_par_tour))


def regles_groupe_nombre_tours(nombre_max: int) -> int:
    """Tontine de groupe : 1 cycle complet, chaque membre ramasse une fois."""
    if nombre_max < 2:
        raise ValueError("Nombre de participants invalide.")
    return nombre_max


def regles_groupe_objectif_stocke(montant_cotisation: int, nombre_max: int) -> int:
    """Volume total collecté sur un cycle (N pots de mise × N). Conservé pour compatibilité."""
    pot_par_tour = montant_cotisation * nombre_max
    if pot_par_tour <= 0:
        raise ValueError("Pot par tour invalide.")
    return pot_par_tour * nombre_max


def pot_par_tour_groupe(montant_cotisation: int, nombre_max: int) -> int:
    return montant_cotisation * nombre_max


def display_name(tontine: Tontine) -> str:
    desc = (tontine.description or "").strip()
    if " — " in desc:
        return desc.split(" — ", 1)[0].strip()
    return desc


def display_name_user(user) -> str:
    if user is None:
        return "Membre"
    name = f"{user.first_name or ''} {user.last_name or ''}".strip()
    return name or getattr(user, "numero_telephone", "") or "Membre"


def user_initials(user) -> str:
    initials = ""
    if user.first_name:
        initials += user.first_name[0].upper()
    if user.last_name:
        initials += user.last_name[0].upper()
    return (initials or "?")[:2]


def serialize_chat_message(message: Chat, *, for_user=None) -> dict:
    sender = message.expediteur
    return {
        "id": message.id,
        "contenu": message.contenu,
        "date": message.date.isoformat(),
        "expediteur_id": sender.id,
        "expediteur_nom": display_name_user(sender),
        "expediteur_avatar": user_initials(sender),
        "is_me": bool(for_user and sender.id == getattr(for_user, "id", None)),
    }


def user_is_active_member(user, tontine: Tontine) -> bool:
    if not user.is_authenticated:
        return False
    return TontineMembre.objects.filter(
        tontine=tontine,
        membre=user,
        statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
    ).exists()


def active_members_count(tontine: Tontine) -> int:
    return TontineMembre.objects.filter(
        tontine=tontine,
        statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
    ).count()


def ordre_ramassage_pret(tontine: Tontine, regle: TontineRegle) -> bool:
    if regle.ordre_ramassage != TontineRegle.ORDRE_RAMASSAGE.DEFINI_PAR_ADMIN:
        return True
    actifs = TontineMembre.objects.filter(
        tontine=tontine,
        statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
    )
    if actifs.count() != regle.nombre_max:
        return False
    ordres = sorted(actifs.values_list("ordre_ramassage", flat=True))
    return ordres == list(range(1, regle.nombre_max + 1))


def groupe_complet(tontine: Tontine, regle: TontineRegle) -> bool:
    return active_members_count(tontine) >= regle.nombre_max


def tontine_cycle_demarre(tontine: Tontine) -> bool:
    """Vrai dès qu'au moins un tour a été créé (tour 1 lancé ou clôturé)."""
    return TourTontine.objects.filter(tontine=tontine).exists()


def groupe_retrait_bloque_raison(tontine: Tontine, regle: Optional[TontineRegle]) -> Optional[str]:
    """
    Retourne un message d'erreur si la tontine de groupe ne peut pas être archivée/supprimée.
    Autorisé avant le tour 1, ou une fois tous les tours terminés.
    """
    if not tontine_cycle_demarre(tontine):
        return None
    if cycle_termine(tontine, regle):
        return None
    return (
        "Impossible d'archiver ou supprimer une tontine dont le cycle est en cours. "
        "Attendez la fin de tous les tours ou agissez avant le démarrage du tour 1."
    )


def cycle_termine(tontine: Tontine, regle: Optional[TontineRegle]) -> bool:
    """Tous les tours sont clôturés et la tontine n'est plus active."""
    if regle is None or regle.nombre_tours <= 0:
        return False
    tours_done = TourTontine.objects.filter(
        tontine=tontine,
        statut_tour=TourTontine.STATUT_TOUR.TERMINE,
    ).count()
    return not tontine.est_active and tours_done >= regle.nombre_tours


def compute_phase(tontine: Tontine, regle: Optional[TontineRegle]) -> str:
    """recruiting | awaiting_ordre | active | completed"""
    if regle is None:
        return "recruiting"
    if cycle_termine(tontine, regle):
        return "completed"
    count = active_members_count(tontine)
    if count < regle.nombre_max:
        return "recruiting"
    if (
        regle.ordre_ramassage == TontineRegle.ORDRE_RAMASSAGE.DEFINI_PAR_ADMIN
        and not ordre_ramassage_pret(tontine, regle)
    ):
        return "awaiting_ordre"
    return "active"


def ordre_mode_api(regle: TontineRegle) -> str:
    if regle.ordre_ramassage == TontineRegle.ORDRE_RAMASSAGE.DEFINI_PAR_ADMIN:
        return "admin"
    return "random"


def tour_en_cours(tontine: Tontine) -> Optional[TourTontine]:
    return (
        TourTontine.objects.filter(
            tontine=tontine,
            statut_tour=TourTontine.STATUT_TOUR.EN_COURS,
        )
        .order_by("numero_du_tour")
        .first()
    )


def turn_label(tontine: Tontine, regle: Optional[TontineRegle]) -> str:
    if regle is None:
        return "0/0"
    tour = tour_en_cours(tontine)
    if tour:
        return f"{tour.numero_du_tour}/{regle.nombre_tours}"
    tours_done = TourTontine.objects.filter(
        tontine=tontine,
        statut_tour=TourTontine.STATUT_TOUR.TERMINE,
    ).count()
    if tours_done >= regle.nombre_tours:
        return f"{regle.nombre_tours}/{regle.nombre_tours}"
    phase = compute_phase(tontine, regle)
    if phase == "active":
        return f"0/{regle.nombre_tours}"
    return f"0/{regle.nombre_max}"


def active_members_ordered(tontine: Tontine):
    return list(
        TontineMembre.objects.filter(
            tontine=tontine,
            statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
        )
        .select_related("membre")
        .order_by("ordre_ramassage", "date_adhesion")
    )


def member_user_ids_paid_for_tour(tontine: Tontine, tour: TourTontine) -> set:
    from apps.wallet.models import Transaction

    return set(
        Transaction.objects.filter(
            tour=tour,
            tontine=tontine,
            type_transaction=Transaction.TYPE_TRANSACTION.DEBIT,
            statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
        ).values_list("wallet__user_id", flat=True)
    )


def next_member_to_pay(tontine: Tontine, tour: TourTontine) -> Optional[TontineMembre]:
    """Prochain membre qui doit cotiser pour ce tour (ordre de ramassage croissant)."""
    paid_ids = member_user_ids_paid_for_tour(tontine, tour)
    for tm in active_members_ordered(tontine):
        if tm.membre_id not in paid_ids:
            return tm
    return None


def _devenu_payeur_at(tour: TourTontine, membres_ordonnes: list, payeur_courant_id: int):
    """Date à laquelle `payeur_courant_id` est structurellement devenu payeur de `tour`.

    Voir `apps.tontine.penalties` (docstring de module) pour la définition
    complète de la deadline glissante. Effectue au plus UNE requête (date du
    débit du membre de rang immédiatement inférieur), appelée une seule fois
    par rendu de détail (uniquement pour le payeur courant), jamais en boucle
    sur tous les membres.
    """
    from apps.wallet.models import Transaction

    for index, tm in enumerate(membres_ordonnes):
        if tm.membre_id != payeur_courant_id:
            continue
        if index == 0:
            return tour.date
        precedent = membres_ordonnes[index - 1]
        debit_at = (
            Transaction.objects.filter(
                tour=tour,
                tontine=tour.tontine,
                wallet__user_id=precedent.membre_id,
                type_transaction=Transaction.TYPE_TRANSACTION.DEBIT,
                statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
            )
            .values_list("date_transaction", flat=True)
            .first()
        )
        return debit_at or tour.date
    return tour.date


def penalites_impayees_par_membre(tontine: Tontine) -> dict:
    """Agrégat `{user_id: {"impayee": Decimal, "count": int}}` des pénalités
    impayées (ni réglées, ni annulées) d'une tontine, en UNE requête groupée.

    Destiné à être calculé une fois par `serialize_tontine_detail` puis
    injecté dans `serialize_member` pour chaque membre — jamais recalculé par
    membre (anti N+1).
    """
    from django.db.models import Count, Sum

    from apps.tontine.models import Penalite

    rows = (
        Penalite.objects.filter(tontine=tontine, est_reglee=False, est_annulee=False)
        .values("user_id")
        .annotate(total=Sum("montant_due"), count=Count("id"))
    )
    return {row["user_id"]: {"impayee": row["total"] or Decimal("0"), "count": row["count"]} for row in rows}


def serialize_member(
    tm: TontineMembre,
    tour: Optional[TourTontine],
    regle: Optional[TontineRegle],
    tontine: Optional[Tontine] = None,
    *,
    penalites_agg: Optional[dict] = None,
    phase: Optional[str] = None,
    membres_ordonnes: Optional[list] = None,
    paid_ids: Optional[set] = None,
    next_user_id: Optional[int] = None,
) -> dict:
    """`phase`, `membres_ordonnes`, `paid_ids`, `next_user_id` sont des caches
    OPTIONNELS destinés à être calculés UNE FOIS par `serialize_tontine_detail`
    pour toute la liste des membres, puis réinjectés ici (même pattern que
    `penalites_agg`) : sans eux, chaque appel recalcule `compute_phase`,
    `member_user_ids_paid_for_tour` et `next_member_to_pay` (qui refait lui-même
    ces deux requêtes) — un N+1 sévère (~9 requêtes/membre mesurées) pour une
    liste de membres censée coûter une poignée de requêtes au total. Quand ils
    ne sont pas fournis (appelant isolé, ex. tests unitaires), le comportement
    de repli reproduit fidèlement l'ancien calcul, requête par requête."""
    user = tm.membre
    initials = ""
    if user.first_name:
        initials += user.first_name[0].upper()
    if user.last_name:
        initials += user.last_name[0].upper()
    if not initials:
        initials = "?"

    name = f"{user.first_name or ''} {user.last_name or ''}".strip() or user.numero_telephone or "Membre"

    if phase is None and tontine and regle:
        phase = compute_phase(tontine, regle)

    # Badges : cotisations une par une, dans l'ordre de ramassage.
    status = "none"
    en_retard = False
    if tontine and regle and phase == "active" and tour is not None:
        if paid_ids is None:
            paid_ids = member_user_ids_paid_for_tour(tontine, tour)
        paid = user.id in paid_ids

        if next_user_id is None:
            next_tm = next_member_to_pay(tontine, tour)
            next_user_id = next_tm.membre_id if next_tm else None

        if paid:
            status = "beneficiary" if tour.user_id == user.id else "paid"
        elif user.id == next_user_id:
            # Seul le payeur courant est pénalisable (deadline glissante, voir
            # `apps.tontine.penalties`) : c'est le seul membre pour lequel un
            # statut "late" a un sens.
            from apps.tontine.penalties import est_en_retard
            from django.utils import timezone

            if membres_ordonnes is None:
                membres_ordonnes = active_members_ordered(tontine)
            devenu_payeur_at = _devenu_payeur_at(tour, membres_ordonnes, user.id)
            en_retard = est_en_retard(regle, tour, devenu_payeur_at, timezone.now())
            status = "late" if en_retard else "awaiting_payment"
        else:
            status = "waiting_turn"

    agg = (penalites_agg or {}).get(user.id, {"impayee": Decimal("0"), "count": 0})

    return {
        "id": str(tm.id),
        "user_id": user.id,
        "name": name,
        "avatar": initials[:2],
        "role": tm.role_membre,
        "ordre_ramassage": tm.ordre_ramassage,
        "status": status,
        "amount": int(regle.montant_cotisation) if regle else 0,
        "turn": tm.ordre_ramassage,
        "penalite_impayee": str(agg["impayee"]),
        "penalites_count": agg["count"],
        "en_retard": en_retard,
    }


def serialize_tontine_summary(
    tontine: Tontine,
    regle: Optional[TontineRegle],
    *,
    for_user=None,
) -> dict:
    phase = compute_phase(tontine, regle)
    membres = active_members_count(tontine)
    tour = tour_en_cours(tontine)
    ordre_publie = bool(
        regle
        and (
            regle.ordre_ramassage == TontineRegle.ORDRE_RAMASSAGE.ALEATOIRE
            or ordre_ramassage_pret(tontine, regle)
        )
    )

    is_admin = False
    if for_user and for_user.is_authenticated:
        from apps.tontine.permissions import user_is_tontine_admin

        is_admin = user_is_tontine_admin(for_user, tontine)

    cotisation = int(regle.montant_cotisation) if regle else 0
    pot_mensuel = cotisation * membres if regle else 0
    objectif_total = int(regle.objectif_cotisation) if regle else 0
    termine = cycle_termine(tontine, regle)

    return {
        "id": tontine.id,
        "type_tontine": tontine.type_tontine,
        "description": tontine.description,
        "nom": display_name(tontine),
        "est_active": tontine.est_active,
        "etat": tontine.etat,
        "date_archivage": tontine.date_archivage.isoformat() if tontine.date_archivage else None,
        "date_suppression": tontine.date_suppression.isoformat() if tontine.date_suppression else None,
        "date_creation": tontine.date_creation.isoformat(),
        "qr_code": tontine.qr_code,
        "hote_id": tontine.hote_id,
        "phase": phase,
        "cycle_termine": termine,
        "membres_actifs": membres,
        "nombre_max": regle.nombre_max if regle else 0,
        "ordre_mode": ordre_mode_api(regle) if regle else None,
        "ordre_publie": ordre_publie,
        "turn": turn_label(tontine, regle),
        "cotisation_amount": cotisation,
        "objectif_total": objectif_total,
        "amount": pot_mensuel,
        "regles": serialize_regle(regle) if regle else None,
        "tour_courant": serialize_tour_brief(tour) if tour else None,
        "is_admin": is_admin,
    }


def serialize_regle(regle: TontineRegle) -> dict:
    return {
        "objectif_cotisation": str(regle.objectif_cotisation),
        "montant_cotisation": str(regle.montant_cotisation),
        "montant_penalite": str(regle.montant_penalite),
        "nombre_max": regle.nombre_max,
        "nombre_tours": regle.nombre_tours,
        "ordre_ramassage": regle.ordre_ramassage,
        "frequence": regle.frequence,
        "frequence_personnalise": regle.frequence_personalise,
        "penalites_actives": regle.montant_penalite > 0,
        "delai_grace_heures": regle.delai_grace_heures,
        "penalites_automatiques": regle.penalites_automatiques,
    }


def serialize_tour_brief(tour: TourTontine) -> dict:
    return {
        "id": tour.id,
        "numero_du_tour": tour.numero_du_tour,
        "beneficiaire_id": tour.user_id,
        "montant_depose": str(tour.montant_depose),
        "statut_tour": tour.statut_tour,
    }


def serialize_tontine_detail(tontine: Tontine, regle: Optional[TontineRegle], for_user) -> dict:
    data = serialize_tontine_summary(tontine, regle, for_user=for_user)
    tour = tour_en_cours(tontine)
    membres_ordonnes = list(
        TontineMembre.objects.filter(
            tontine=tontine,
            statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
        )
        .select_related("membre")
        .order_by("ordre_ramassage", "date_adhesion")
    )
    # Tout ce qui suit est calculé UNE fois pour la liste entière (jamais par
    # membre) : `penalites_agg` (déjà le cas), `phase` (réutilise celle déjà
    # calculée par `serialize_tontine_summary`), `paid_ids` et `next_user_id`
    # (dérivé en Python de `paid_ids` + `membres_ordonnes`, sans requête
    # supplémentaire) — voir la docstring de `serialize_member` pour le détail
    # du N+1 que ce cache élimine.
    penalites_agg = penalites_impayees_par_membre(tontine)
    phase = data["phase"]
    paid_ids = None
    next_user_id = None
    if phase == "active" and tour is not None:
        paid_ids = member_user_ids_paid_for_tour(tontine, tour)
        for tm in membres_ordonnes:
            if tm.membre_id not in paid_ids:
                next_user_id = tm.membre_id
                break
    data["membres"] = [
        serialize_member(
            tm,
            tour,
            regle,
            tontine,
            penalites_agg=penalites_agg,
            phase=phase,
            membres_ordonnes=membres_ordonnes,
            paid_ids=paid_ids,
            next_user_id=next_user_id,
        )
        for tm in membres_ordonnes
    ]
    data["pot_attendu"] = str(regle.montant_cotisation * regle.nombre_max) if regle else "0"
    if tour:
        data["pot_collecte"] = str(tour.montant_depose)
    else:
        data["pot_collecte"] = "0"

    total_impayees = sum((v["impayee"] for v in penalites_agg.values()), Decimal("0"))
    data["total_penalites_impayees"] = str(total_impayees)
    for_user_id = getattr(for_user, "id", None)
    ma_penalite = penalites_agg.get(for_user_id, {"impayee": Decimal("0")})
    data["ma_penalite_impayee"] = str(ma_penalite["impayee"])
    return data


def recompact_ordre_ramassage(tontine: Tontine) -> None:
    """Réassigne `ordre_ramassage = 1..N` aux membres actifs restants (ordre relatif conservé).

    Appelé après l'exclusion d'un membre pour que la colonne reste une
    permutation dense de 1 à N (invariant attendu par `ordre_ramassage_pret`,
    `_beneficiaire_pour_tour`, etc.). DOIT être appelé sous verrou (la tontine
    est déjà verrouillée par l'appelant via `select_for_update`) pour éviter
    qu'une écriture concurrente ne heurte la contrainte unique
    `uniq_tontine_ordre_ramassage` en cours de recompactage : on procède donc
    en deux passes, la première basculant tous les ordres sur des valeurs
    négatives (jamais utilisées, donc jamais en conflit entre elles ni avec
    les valeurs positives finales), la seconde les fixant définitivement.
    """
    actifs = list(
        TontineMembre.objects.filter(
            tontine=tontine,
            statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
        ).order_by("ordre_ramassage", "date_adhesion")
    )
    for index, tm in enumerate(actifs, start=1):
        TontineMembre.objects.filter(pk=tm.pk).update(ordre_ramassage=-index)
    for index, tm in enumerate(actifs, start=1):
        TontineMembre.objects.filter(pk=tm.pk).update(ordre_ramassage=index)


def assign_ordre_ramassage_tirage(tontine: Tontine, membre_id: int, numero_du_tour: int) -> None:
    """Persiste le rang réellement obtenu par tirage au sort (mode ALÉATOIRE).

    Après un tirage pour le tour `numero_du_tour`, le membre tiré doit porter
    `ordre_ramassage = numero_du_tour` : sinon `ordre_ramassage` reste la
    valeur provisoire d'adhésion (`next_provisional_ordre`), ce qui fausse
    l'affichage du rang côté UI ainsi que le tri de `next_member_to_pay` /
    `active_members_ordered`. Comme `ordre_ramassage` est soumis à la
    contrainte unique `uniq_tontine_ordre_ramassage`, on ne peut pas se
    contenter d'écraser la valeur : il faut permuter avec le membre qui
    détient déjà ce rang. On reprend la technique en deux passes de
    `recompact_ordre_ramassage` : les deux lignes concernées basculent
    d'abord sur des valeurs négatives (jamais utilisées, donc jamais en
    conflit), puis sont fixées définitivement. DOIT être appelé sous verrou
    (la tontine / le tour est déjà verrouillé par l'appelant via
    `select_for_update`, cf. `_changer_tour_impl`).
    """
    gagnant = TontineMembre.objects.select_for_update().get(
        tontine=tontine,
        membre_id=membre_id,
    )
    ancien_rang = gagnant.ordre_ramassage
    if ancien_rang == numero_du_tour:
        return  # Déjà au bon rang (cas limite), rien à permuter.

    occupant = (
        TontineMembre.objects.select_for_update()
        .filter(tontine=tontine, ordre_ramassage=numero_du_tour)
        .exclude(pk=gagnant.pk)
        .first()
    )

    # Passe 1 : valeurs temporaires négatives (hors de portée de la
    # contrainte unique, qui ne porte que sur des rangs positifs 1..N).
    TontineMembre.objects.filter(pk=gagnant.pk).update(ordre_ramassage=-numero_du_tour)
    if occupant is not None:
        TontineMembre.objects.filter(pk=occupant.pk).update(ordre_ramassage=-ancien_rang)

    # Passe 2 : valeurs définitives, la permutation est maintenant sans risque.
    TontineMembre.objects.filter(pk=gagnant.pk).update(ordre_ramassage=numero_du_tour)
    if occupant is not None:
        TontineMembre.objects.filter(pk=occupant.pk).update(ordre_ramassage=ancien_rang)


def member_ever_paid(tontine: Tontine, user_id: int) -> bool:
    """Vrai si `user_id` a déjà réglé au moins une cotisation (tous tours confondus)."""
    from apps.wallet.models import Transaction

    return Transaction.objects.filter(
        tontine=tontine,
        wallet__user_id=user_id,
        type_transaction=Transaction.TYPE_TRANSACTION.DEBIT,
        statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
    ).exists()


def member_ever_beneficiary(tontine: Tontine, user_id: int) -> bool:
    """Vrai si `user_id` a déjà été désigné bénéficiaire d'un tour (en cours ou terminé)."""
    return TourTontine.objects.filter(tontine=tontine, user_id=user_id).exists()


def next_provisional_ordre(tontine: Tontine, regle: TontineRegle) -> Optional[int]:
    used = set(
        TontineMembre.objects.filter(
            tontine=tontine,
            statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
        ).values_list("ordre_ramassage", flat=True)
    )
    for slot in range(1, regle.nombre_max + 1):
        if slot not in used:
            return slot
    return None


def phones_match(invite_phone: str, user) -> bool:
    from apps.utils.utilitaires import _normalize_phone

    a = _normalize_phone(invite_phone)
    b = _normalize_phone(str(getattr(user, "numero_telephone", "") or ""))
    if not a or not b:
        return False
    return a == b or a.endswith(b[-10:]) or b.endswith(a[-10:])


def pending_invitation_for_user(tontine: Tontine, user) -> Optional[Invitations]:
    pending = Invitations.objects.filter(
        tontine=tontine,
        statut_invitation=Invitations.STATUT_INVITATION.EN_ATTENTE,
        est_utilisee=False,
    )
    for inv in pending:
        if phones_match(inv.numero_telephone_invite, user):
            return inv
    return None


def serialize_invitation(invitation: Invitations, regle: Optional[TontineRegle]) -> dict:
    """Vue d'une invitation (liste ou écran de validation des règles)."""
    tontine = invitation.tontine
    membres = active_members_count(tontine)
    cotisation = int(regle.montant_cotisation) if regle else 0
    objectif_total = int(regle.objectif_cotisation) if regle else 0
    pot_par_tour = cotisation * regle.nombre_max if regle else 0
    data = {
        "token": invitation.token,
        "statut_invitation": invitation.statut_invitation,
        "date_invitation": invitation.date_invitation.isoformat(),
        "numero_telephone_invite": invitation.numero_telephone_invite,
        "tontine_id": tontine.id,
        "tontine_nom": display_name(tontine),
        "description": (tontine.description or "").strip(),
        "hote_nom": display_name_user(tontine.hote),
        "membres_actifs": membres,
        "nombre_max": regle.nombre_max if regle else 0,
        "nombre_tours": regle.nombre_tours if regle else 0,
        "cotisation_amount": cotisation,
        "objectif_total": objectif_total,
        "pot_par_tour": pot_par_tour,
        "frequence": regle.frequence if regle else None,
        "frequence_personnalise": regle.frequence_personalise if regle else None,
        "ordre_ramassage": regle.ordre_ramassage if regle else None,
        "montant_penalite": int(regle.montant_penalite) if regle else 0,
        "penalites_actives": bool(regle and regle.montant_penalite > 0),
        # Un invité doit connaître le régime de sanction avant d'accepter les
        # règles — point de conformité (voir spec pénalités automatiques).
        "delai_grace_heures": regle.delai_grace_heures if regle else None,
        "penalites_automatiques": bool(regle and regle.penalites_automatiques),
        "phase": compute_phase(tontine, regle),
        "regles_definies": regle is not None,
        "regles": serialize_regle(regle) if regle else None,
    }
    return data
