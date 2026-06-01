"""État UX et sérialisation des tontines de groupe."""

from __future__ import annotations

import math
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


def compute_phase(tontine: Tontine, regle: Optional[TontineRegle]) -> str:
    """recruiting | awaiting_ordre | active"""
    if regle is None:
        return "recruiting"
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


def serialize_member(
    tm: TontineMembre,
    tour: Optional[TourTontine],
    regle: Optional[TontineRegle],
    tontine: Optional[Tontine] = None,
) -> dict:
    user = tm.membre
    initials = ""
    if user.first_name:
        initials += user.first_name[0].upper()
    if user.last_name:
        initials += user.last_name[0].upper()
    if not initials:
        initials = "?"

    name = f"{user.first_name or ''} {user.last_name or ''}".strip() or user.numero_telephone or "Membre"

    # Badges : cotisations une par une, dans l'ordre de ramassage.
    status = "none"
    if tontine and regle and compute_phase(tontine, regle) == "active" and tour is not None:
        paid_ids = member_user_ids_paid_for_tour(tontine, tour)
        paid = user.id in paid_ids
        next_tm = next_member_to_pay(tontine, tour)
        next_user_id = next_tm.membre_id if next_tm else None

        if paid:
            status = "beneficiary" if tour.user_id == user.id else "paid"
        elif user.id == next_user_id:
            status = "awaiting_payment"
        else:
            status = "waiting_turn"

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

    return {
        "id": tontine.id,
        "type_tontine": tontine.type_tontine,
        "description": tontine.description,
        "nom": display_name(tontine),
        "est_active": tontine.est_active,
        "date_creation": tontine.date_creation.isoformat(),
        "qr_code": tontine.qr_code,
        "hote_id": tontine.hote_id,
        "phase": phase,
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
    membres_qs = (
        TontineMembre.objects.filter(
            tontine=tontine,
            statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
        )
        .select_related("membre")
        .order_by("ordre_ramassage", "date_adhesion")
    )
    data["membres"] = [serialize_member(tm, tour, regle, tontine) for tm in membres_qs]
    data["pot_attendu"] = str(regle.montant_cotisation * regle.nombre_max) if regle else "0"
    if tour:
        data["pot_collecte"] = str(tour.montant_depose)
    else:
        data["pot_collecte"] = "0"
    return data


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
        "phase": compute_phase(tontine, regle),
        "regles_definies": regle is not None,
        "regles": serialize_regle(regle) if regle else None,
    }
    return data
