import re
import secrets
from decimal import Decimal, InvalidOperation
from typing import Optional

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone
from django.http import JsonResponse
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from apps.utils.utilitaires import (
    _normalize_phone,
    _generate_qr_payload,
    _parse_positive_int,
    _parse_positive_decimal,
    _unique_ref,
    _resolve_payment_mode,
    _resolve_user_by_phone_exact,
    _get_tontine_for_member,
    _serializer_error_response,
)

from apps.tontine.models import (
    Invitations,
    Penalite,
    Tontine,
    TontineMembre,
    TontineRegle,
    TourTontine, Chat,
)
from apps.tontine.serializers import (
    AcceptInvitationSerializer,
    AttributePenaliteSerializer,
    CreateTontineSerializer,
    DefineTontineRegleSerializer,
    ExcludeMemberSerializer,
    GroupeIdSerializer,
    ModifyTontineRegleSerializer,
    PenaliteIdSerializer,
    PostChatMessageSerializer,
    ReglerPenaliteSerializer,
    SendInvitationSerializer,
    SetMemberRoleSerializer,
    TokenRequiredSerializer,
    TontineIdRequiredSerializer,
    _as_bool,
    _resolve_ordre_ramassage,
)
from apps.tontine.helpers import (
    active_members_count,
    assign_ordre_ramassage_tirage,
    compute_nombre_tours,
    member_ever_beneficiary,
    member_ever_paid,
    member_user_ids_paid_for_tour,
    recompact_ordre_ramassage,
    regles_groupe_nombre_tours,
    regles_groupe_objectif_stocke,
    compute_phase,
    display_name,
    display_name_user,
    groupe_complet,
    groupe_retrait_bloque_raison,
    next_member_to_pay,
    next_provisional_ordre,
    ordre_ramassage_pret,
    pending_invitation_for_user,
    phones_match,
    serialize_chat_message,
    serialize_invitation,
    serialize_tontine_detail,
    serialize_tontine_summary,
    tour_en_cours,
)
from apps.tontine.permissions import user_is_tontine_admin
from apps.audits.models import AuditLog
from apps.notifications.domain.catalog import (
    spec_invitation_tontine,
    spec_membre_exclu,
    spec_membre_exclu_annonce,
    spec_paiement_valide,
    spec_penalite_annulee,
    spec_penalite_attribuee,
    spec_regles_modifiees,
    spec_role_modifie,
)
from apps.notifications.services.notification_service import NotificationService
from apps.tontine.scheduling import tour_echeance
from apps.tontine.services.penalties_service import (
    PenaliteDejaTraiteeError,
    RemboursementImpossibleError,
    SoldeInsuffisantError,
    marquer_penalite_reglee_hors_app,
    regler_penalite_par_wallet,
    rembourser_penalite,
)
from apps.wallet.models import Transaction, Wallet

ETAT = Tontine.ETAT


def health(request):
    return JsonResponse({"module": "tontine", "status": "ok"})



def _get_regle(tontine: Tontine):
    try:
        return tontine.tontineregle
    except TontineRegle.DoesNotExist:
        return None


def _groupe_not_found_response(user, tontine_id):
    if Tontine.objects.filter(
        hote=user,
        pk=tontine_id,
        type_tontine=Tontine.TYPE_TONTINE.GROUPE,
        etat=ETAT.SUPPRIME,
    ).exists():
        return Response(
            {"detail": "Tontine supprimée."},
            status=status.HTTP_404_NOT_FOUND,
        )
    return Response(
        {"detail": "Tontine introuvable."},
        status=status.HTTP_404_NOT_FOUND,
    )


def _get_groupe_for_admin(user, tontine_id, *, for_update=False):
    qs = Tontine.objects.filter(
        pk=tontine_id,
        type_tontine=Tontine.TYPE_TONTINE.GROUPE,
    ).exclude(etat=ETAT.SUPPRIME)
    if for_update:
        qs = qs.select_for_update()
    tontine = qs.first()
    if tontine is None:
        return None, _groupe_not_found_response(user, tontine_id)
    if not user_is_tontine_admin(user, tontine):
        return None, Response(
            {"detail": "Seul l'organisateur peut effectuer cette action."},
            status=status.HTTP_403_FORBIDDEN,
        )
    return tontine, None


def _resolve_tontine_member(tontine: Tontine, request_data) -> Optional[TontineMembre]:
    """Résout le membre cible via user_id, membre_id ou numero_telephone."""
    user_id = request_data.get("user_id")
    if user_id not in (None, ""):
        try:
            return TontineMembre.objects.select_related("membre").get(
                tontine=tontine,
                membre_id=int(user_id),
                statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
            )
        except (TontineMembre.DoesNotExist, ValueError, TypeError):
            return None

    membre_id = request_data.get("membre_id")
    if membre_id not in (None, ""):
        try:
            return TontineMembre.objects.select_related("membre").get(
                pk=membre_id,
                tontine=tontine,
                statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
            )
        except (TontineMembre.DoesNotExist, ValueError, TypeError):
            return None

    phone = _normalize_phone(str(request_data.get("numero_telephone") or ""))
    if phone:
        from apps.utils.utilitaires import _resolve_user_by_phone_exact

        user = _resolve_user_by_phone_exact(phone)
        if user is None:
            return None
        try:
            return TontineMembre.objects.select_related("membre").get(
                tontine=tontine,
                membre=user,
                statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
            )
        except TontineMembre.DoesNotExist:
            return None

    return None


def _resolve_tontine_member_any_status(tontine: Tontine, request_data) -> Optional[TontineMembre]:
    """Comme `_resolve_tontine_member`, mais sans filtrer sur `statut_membre=ACTIF`.

    Utilisé par les actions d'administration (exclusion, changement de rôle) qui
    doivent pouvoir distinguer un membre inconnu d'un membre déjà exclu / parti,
    pour renvoyer un message d'erreur précis plutôt qu'un "introuvable" générique.
    """
    user_id = request_data.get("user_id")
    if user_id not in (None, ""):
        try:
            return TontineMembre.objects.select_related("membre").get(
                tontine=tontine, membre_id=int(user_id)
            )
        except (TontineMembre.DoesNotExist, ValueError, TypeError):
            return None

    membre_id = request_data.get("membre_id")
    if membre_id not in (None, ""):
        try:
            return TontineMembre.objects.select_related("membre").get(
                pk=membre_id, tontine=tontine
            )
        except (TontineMembre.DoesNotExist, ValueError, TypeError):
            return None

    phone = _normalize_phone(str(request_data.get("numero_telephone") or ""))
    if phone:
        user = _resolve_user_by_phone_exact(phone)
        if user is None:
            return None
        try:
            return TontineMembre.objects.select_related("membre").get(
                tontine=tontine, membre=user
            )
        except TontineMembre.DoesNotExist:
            return None

    return None


def _serialize_penalite(penalite: Penalite) -> dict:
    return {
        "id": penalite.id,
        "tontine_id": penalite.tontine_id,
        "user_id": penalite.user_id,
        "tour_id": penalite.tour_id,
        "numero_du_tour": penalite.tour.numero_du_tour if penalite.tour_id and penalite.tour else None,
        "type_penalite": penalite.type_penalite,
        "montant_penalite": str(penalite.montant_penalite),
        "montant_due": str(penalite.montant_due),
        "motif": penalite.motif,
        "est_reglee": penalite.est_reglee,
        "est_annulee": penalite.est_annulee,
        "statut": penalite.statut,
        "est_automatique": penalite.est_automatique,
        "source": "auto" if penalite.est_automatique else "manuelle",
        "nombre_tentatives": penalite.nombre_tentatives,
        "date_derniere_tentative": (
            penalite.date_derniere_tentative.isoformat()
            if penalite.date_derniere_tentative
            else None
        ),
        "ref_transaction_reglement": penalite.ref_transaction_reglement,
        # Réglable par débit réel uniquement si un tour (donc un bénéficiaire)
        # est connu — voir `apps.tontine.services.penalties_service`.
        "peut_regler_par_wallet": bool(penalite.tour_id) and not penalite.est_reglee and not penalite.est_annulee,
        "date_attribution_penalite": penalite.date_attribution_penalite.isoformat(),
        "date_reglement_penalite": (
            penalite.date_reglement_penalite.isoformat()
            if penalite.date_reglement_penalite
            else None
        ),
        "date_annulation": (
            penalite.date_annulation.isoformat() if penalite.date_annulation else None
        ),
    }


def _active_members_count(tontine: Tontine) -> int:
    return TontineMembre.objects.filter(
        tontine=tontine,
        statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
    ).count()


def _groupe_complet(tontine: Tontine, regle: TontineRegle) -> bool:
    return _active_members_count(tontine) >= regle.nombre_max


def _ordre_ramassage_pret(tontine: Tontine, regle: TontineRegle) -> bool:
    """Mode admin : tous les membres actifs ont un ordre 1..nombre_max."""
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


def _serialize_tour(tour: TourTontine) -> dict:
    return {
        "id": tour.id,
        "tontine_id": tour.tontine_id,
        "beneficiaire_id": tour.user_id,
        "numero_du_tour": tour.numero_du_tour,
        "montant_depose": str(tour.montant_depose),
        "statut_tour": tour.statut_tour,
        "date": tour.date.isoformat(),
    }


def _users_deja_servis(tontine: Tontine, *extra_user_ids: int) -> set:
    """Membres ayant déjà reçu le pot (tours terminés + exclusions explicites)."""
    deja_servis = set(
        TourTontine.objects.filter(
            tontine=tontine,
            statut_tour=TourTontine.STATUT_TOUR.TERMINE,
        ).values_list("user_id", flat=True)
    )
    for user_id in extra_user_ids:
        if user_id:
            deja_servis.add(user_id)
    return deja_servis


def _beneficiaire_pour_tour(
    tontine: Tontine,
    regle: TontineRegle,
    numero_du_tour: int,
    *,
    exclude_user_ids: Optional[set] = None,
    request_user=None,
):
    """Détermine le bénéficiaire du tour `numero_du_tour`.

    Mode admin : lit simplement `ordre_ramassage`. Mode aléatoire : tire au
    sort parmi les membres actifs pas encore servis, avec `secrets.SystemRandom`
    (générateur cryptographiquement sûr — `random.choice`/Mersenne Twister
    serait prévisible sur une app financière), journalise le tirage dans
    `AuditLog` (auditabilité : les membres doivent pouvoir vérifier qu'il n'a
    pas été truqué) et persiste le rang réellement obtenu sur le membre tiré.
    Appelé depuis `_changer_tour_impl`, donc déjà sous la transaction atomique
    et le verrou du tour en cours.
    """
    if regle.ordre_ramassage == TontineRegle.ORDRE_RAMASSAGE.DEFINI_PAR_ADMIN:
        try:
            return TontineMembre.objects.select_related("membre").get(
                tontine=tontine,
                ordre_ramassage=numero_du_tour,
                statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
            ).membre
        except TontineMembre.DoesNotExist:
            return None

    extra = tuple(exclude_user_ids or ())
    deja_servis = _users_deja_servis(tontine, *extra)
    eligibles = list(
        TontineMembre.objects.filter(
            tontine=tontine,
            statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
        ).exclude(membre_id__in=deja_servis).select_related("membre")
    )
    if not eligibles:
        return None

    gagnant_tm = secrets.SystemRandom().choice(eligibles)
    gagnant = gagnant_tm.membre

    # Le rang provisoire d'adhésion (`next_provisional_ordre`) ne reflète pas
    # le tirage réel : on le remplace par le rang effectivement obtenu, sous
    # peine d'afficher un faux rang et de désynchroniser `next_member_to_pay` /
    # `active_members_ordered` (voir docstring de `assign_ordre_ramassage_tirage`).
    assign_ordre_ramassage_tirage(tontine, gagnant.id, numero_du_tour)

    AuditLog.objects.create(
        user=request_user,
        user_display=display_name_user(request_user) if request_user else "Système",
        action=AuditLog.Action.RANDOM_DRAW_PERFORMED,
        resource=(
            f"tontine:{tontine.pk}:tour:{numero_du_tour}:"
            f"beneficiaire:{gagnant.pk}:vivier={len(eligibles)}"
        ),
        status=AuditLog.Status.SUCCESS,
    )

    return gagnant


def _pot_attendu(regle: TontineRegle) -> Decimal:
    return regle.montant_cotisation * regle.nombre_max


def _serialize_regle(regle: TontineRegle) -> dict:
    return {
        "id": regle.id,
        "objectif_cotisation": str(regle.objectif_cotisation),
        "montant_cotisation": str(regle.montant_cotisation),
        "montant_penalite": str(regle.montant_penalite),
        "nombre_max": regle.nombre_max,
        "nombre_tours": regle.nombre_tours,
        "ordre_ramassage": regle.ordre_ramassage,
        "frequence": regle.frequence,
        "frequence_personnalise": regle.frequence_personalise,
        "delai_grace_heures": regle.delai_grace_heures,
        "penalites_automatiques": regle.penalites_automatiques,
    }


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_tontine(request):
    """Création par l’utilisateur connecté : il devient hôte et premier membre admin."""
    serializer = CreateTontineSerializer(data=request.data)
    if not serializer.is_valid():
        return _serializer_error_response(serializer)
    raw_type = serializer.validated_data["type_tontine"]
    description = serializer.validated_data["description"]

    user = request.user
    with transaction.atomic():
        tontine = Tontine(
            hote=user,
            type_tontine=raw_type,
            description=description,
            qr_code="pending",
        )
        tontine.save()
        tontine.qr_code = _generate_qr_payload(tontine.id)
        tontine.save(update_fields=["qr_code"])

        TontineMembre.objects.create(
            tontine=tontine,
            membre=user,
            role_membre=TontineMembre.ROLE_MEMBRE.ADMIN,
            statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
            ordre_ramassage=1,
        )




    return Response(
        {
            "id": tontine.id,
            "type_tontine": tontine.type_tontine,
            "description": tontine.description,
            "qr_code": tontine.qr_code,
            "hote_id": tontine.hote_id,
        },
        status=status.HTTP_201_CREATED,
    )



@api_view(["POST"])
@permission_classes([IsAuthenticated])
def define_tontine_regle(request):
    """Définit les règles d'une tontine (hôte ou admin, une seule fois)."""
    user = request.user

    serializer = DefineTontineRegleSerializer(data=request.data)
    if not serializer.is_valid():
        return _serializer_error_response(serializer)
    tontine_id = serializer.validated_data["tontine_id"]
    montant_cotisation = serializer.validated_data["montant_cotisation"]
    nombre_max = serializer.validated_data["nombre_max"]
    ordre_ramassage = serializer.validated_data["ordre_ramassage"]
    frequence_choisie = serializer.validated_data["frequence"]
    frequence_personnalise = serializer.validated_data["frequence_personnalise"]
    inclure_penalite = serializer.validated_data["inclure_penalite"]
    type_penalite = serializer.validated_data["type_penalite"]
    montant_penalite = serializer.validated_data["montant_penalite"]
    delai_grace_heures = serializer.validated_data["delai_grace_heures"]
    penalites_automatiques = serializer.validated_data["penalites_automatiques"]

    try:
        tontine = Tontine.objects.get(pk=tontine_id)
    except (Tontine.DoesNotExist, ValueError, TypeError):
        return Response({"detail": "Tontine introuvable."}, status=status.HTTP_404_NOT_FOUND)

    if not user_is_tontine_admin(user, tontine):
        return Response(
            {"detail": "Seul l'hôte ou un administrateur peut définir les règles."},
            status=status.HTTP_403_FORBIDDEN,
        )

    if TontineRegle.objects.filter(tontine=tontine).exists():
        return Response(
            {"detail": "Les règles de cette tontine sont déjà définies."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if tontine.type_tontine == Tontine.TYPE_TONTINE.GROUPE:
        try:
            nombre_tours = regles_groupe_nombre_tours(nombre_max)
            objectif_cotisation = regles_groupe_objectif_stocke(montant_cotisation, nombre_max)
        except ValueError:
            return Response(
                {"detail": "Impossible de calculer les règles avec ces montants."},
                status=status.HTTP_400_BAD_REQUEST,
            )
    else:
        objectif_cotisation = _parse_positive_int(request.data.get("objectif_cotisation"))
        if objectif_cotisation is None:
            return Response(
                {"detail": "Objectif de cotisation (montant total) invalide ou absent."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            nombre_tours = compute_nombre_tours(objectif_cotisation, montant_cotisation, nombre_max)
        except ValueError:
            return Response(
                {"detail": "Impossible de calculer le nombre de tours avec ces montants."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    regles = TontineRegle.objects.create(
        tontine=tontine,
        objectif_cotisation=objectif_cotisation,
        montant_cotisation=montant_cotisation,
        montant_penalite=montant_penalite,
        nombre_max=nombre_max,
        nombre_tours=nombre_tours,
        ordre_ramassage=ordre_ramassage,
        frequence=frequence_choisie,
        frequence_personalise=frequence_personnalise,
        delai_grace_heures=delai_grace_heures,
        penalites_automatiques=penalites_automatiques,
    )

    now = timezone.now()
    TontineMembre.objects.filter(
        tontine=tontine,
        statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
    ).update(regles_acceptees=True, date_acceptation_regles=now)

    penalites_payload = {
        "active": inclure_penalite,
        "montant_penalite": montant_penalite,
    }

    return Response(
        {
            "tontine_id": tontine.id,
            "regles": _serialize_regle(regles),
            "nombre_tours": nombre_tours,
            "penalites": penalites_payload,
        },
        status=status.HTTP_201_CREATED,
    )



@api_view(["POST"])
@permission_classes([IsAuthenticated])
def attribute_penalite(request):
    """
    Attribue une pénalité à un membre actif (admin / hôte uniquement).
    Le montant par défaut provient des règles de la tontine si non précisé.
    """
    serializer = AttributePenaliteSerializer(data=request.data)
    if not serializer.is_valid():
        return _serializer_error_response(serializer)
    tontine_id = serializer.validated_data["tontine_id"]
    type_penalite = serializer.validated_data["type_penalite"]
    motif = serializer.validated_data["motif"]

    try:
        tontine = Tontine.objects.get(pk=tontine_id)
    except (Tontine.DoesNotExist, ValueError, TypeError):
        return Response({"detail": "Tontine introuvable."}, status=status.HTTP_404_NOT_FOUND)

    if not user_is_tontine_admin(request.user, tontine):
        return Response(
            {"detail": "Seul l'hôte ou un administrateur peut attribuer une pénalité."},
            status=status.HTTP_403_FORBIDDEN,
        )

    regle = _get_regle(tontine)
    if regle is None:
        return Response(
            {"detail": "Les règles de la tontine ne sont pas encore définies."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if regle.montant_penalite <= 0:
        return Response(
            {"detail": "Les pénalités ne sont pas activées pour cette tontine."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    tontine_membre = _resolve_tontine_member(tontine, request.data)
    if tontine_membre is None:
        return Response(
            {
                "detail": (
                    "Membre introuvable ou inactif. "
                    "Indiquez user_id, membre_id ou numero_telephone."
                ),
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    target_user = tontine_membre.membre

    # Restreint aux pénalités MANUELLES : les pénalités automatiques (une par
    # tour, voir `uniq_penalite_auto_par_tour_et_user`) ne doivent pas entrer
    # en conflit avec cette garde, sans quoi un membre déjà en retard
    # automatique sur un tour ne pourrait plus recevoir de pénalité manuelle
    # distincte (ex : pour un motif disciplinaire hors cotisation).
    if Penalite.objects.filter(
        tontine=tontine,
        user=target_user,
        type_penalite=type_penalite,
        est_reglee=False,
        est_annulee=False,
        est_automatique=False,
    ).exists():
        return Response(
            {"detail": "Ce membre a déjà une pénalité impayée de ce type."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    montant_penalite = _parse_positive_decimal(request.data.get("montant_penalite"))
    if montant_penalite is None:
        montant_penalite = regle.montant_penalite

    montant_due = _parse_positive_decimal(request.data.get("montant_due"))
    if montant_due is None:
        montant_due = montant_penalite

    with transaction.atomic():
        # Verrouille la tontine pour sérialiser les attributions concurrentes.
        Tontine.objects.select_for_update().get(pk=tontine.pk)

        # Recontrôle sous verrou : le check plus haut (ligne ~542) est fait avant
        # l'acquisition de ce verrou, donc deux requêtes admin quasi simultanées
        # peuvent toutes deux le franchir. Le verrou sur la tontine sérialise
        # leur exécution ; ce recontrôle après acquisition empêche la double
        # pénalité (même pattern que `cotiser_tontine`).
        if Penalite.objects.filter(
            tontine=tontine,
            user=target_user,
            type_penalite=type_penalite,
            est_reglee=False,
            est_annulee=False,
            est_automatique=False,
        ).exists():
            return Response(
                {"detail": "Ce membre a déjà une pénalité impayée de ce type."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        penalite = Penalite.objects.create(
            tontine=tontine,
            user=target_user,
            type_penalite=type_penalite,
            montant_penalite=montant_penalite,
            montant_due=montant_due,
            motif=motif,
            est_reglee=False,
            est_automatique=False,
        )

        AuditLog.objects.create(
            user=request.user,
            user_display=display_name_user(request.user),
            action=AuditLog.Action.PENALTY_ASSIGNED,
            resource=(
                f"tontine:{tontine.pk}:membre:{target_user.pk}:"
                f"penalite:{penalite.pk}:montant={montant_penalite}"
            ),
            status=AuditLog.Status.SUCCESS,
        )

        NotificationService.emit(
            destinataire=target_user,
            spec=spec_penalite_attribuee(
                tontine_nom=display_name(tontine),
                tontine_id=tontine.id,
                montant=montant_penalite,
                type_penalite=type_penalite,
            ),
        )

    return Response(
        {
            "detail": "Pénalité attribuée.",
            "penalite": _serialize_penalite(penalite),
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def changer_tour(request):
    """Clôture le tour en cours et démarre le suivant (ou le tour 1)."""
    return _changer_tour_impl(request)


def _changer_tour_impl(request):
    """
    Clôture le tour en cours (TERMINÉ) et démarre le tour suivant (EN COURS).
    Sans tour existant : démarre le tour 1.
    Réservé à l'hôte / admin.
    """
    id_serializer = TontineIdRequiredSerializer(data=request.data)
    if not id_serializer.is_valid():
        return _serializer_error_response(id_serializer)
    tontine_id = id_serializer.validated_data["tontine_id"]

    try:
        tontine = Tontine.objects.get(pk=tontine_id)
    except (Tontine.DoesNotExist, ValueError, TypeError):
        return Response({"detail": "Tontine introuvable."}, status=status.HTTP_404_NOT_FOUND)

    if not user_is_tontine_admin(request.user, tontine):
        return Response(
            {"detail": "Seul l'hôte ou un administrateur peut changer de tour."},
            status=status.HTTP_403_FORBIDDEN,
        )

    regle = _get_regle(tontine)
    if regle is None:
        return Response(
            {"detail": "Les règles de la tontine ne sont pas encore définies."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not _groupe_complet(tontine, regle):
        return Response(
            {
                "detail": (
                    "Le groupe n'est pas complet. "
                    f"{_active_members_count(tontine)}/{regle.nombre_max} membres actifs."
                ),
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not _ordre_ramassage_pret(tontine, regle):
        return Response(
            {"detail": "L'ordre de ramassage doit être défini avant de démarrer les tours."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    tour_cloture_data = None
    tour_suivant_data = None
    tontine_terminee = False

    with transaction.atomic():
        # Verrouille la tontine : indispensable pour sérialiser le démarrage
        # du tour 1, qui ne peut pas s'appuyer sur un `select_for_update` de
        # `TourTontine` (aucune ligne n'existe encore à verrouiller). Sans ce
        # verrou, deux requêtes concurrentes peuvent toutes deux franchir le
        # contrôle "aucun tour n'existe" avant que l'une des deux ne committe,
        # et tenter de créer deux fois le tour 1 (violation de la contrainte
        # unique `uniq_tontine_numero_tour`, exception non gérée). Une fois au
        # moins un tour créé, ce verrou sérialise aussi avec le
        # `select_for_update` déjà posé sur la ligne `TourTontine` EN_COURS.
        Tontine.objects.select_for_update().get(pk=tontine.pk)

        tour_en_cours = (
            TourTontine.objects.select_for_update()
            .filter(tontine=tontine, statut_tour=TourTontine.STATUT_TOUR.EN_COURS)
            .order_by("numero_du_tour")
            .first()
        )

        if tour_en_cours is None:
            if TourTontine.objects.filter(tontine=tontine).exists():
                return Response(
                    {"detail": "Aucun tour en cours. Impossible de passer au suivant."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            beneficiaire = _beneficiaire_pour_tour(
                tontine, regle, 1, request_user=request.user
            )
            if beneficiaire is None:
                return Response(
                    {"detail": "Impossible de déterminer le bénéficiaire du tour 1."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            nouveau = TourTontine.objects.create(
                tontine=tontine,
                user=beneficiaire,
                numero_du_tour=1,
                montant_depose=Decimal("0"),
                statut_tour=TourTontine.STATUT_TOUR.EN_COURS,
            )
            nouveau.date_echeance = tour_echeance(regle, nouveau)
            nouveau.save(update_fields=["date_echeance"])
            tour_suivant_data = _serialize_tour(nouveau)

            AuditLog.objects.create(
                user=request.user,
                user_display=display_name_user(request.user),
                action=AuditLog.Action.ROUND_STARTED,
                resource=f"tontine:{tontine.pk}:tour:{nouveau.pk}:numero=1",
                status=AuditLog.Status.SUCCESS,
            )

            return Response(
                {
                    "detail": "Tour 1 démarré.",
                    "tontine_id": tontine.id,
                    "tour_cloture": None,
                    "tour_suivant": tour_suivant_data,
                    "tontine_terminee": False,
                    "numero_tour_actuel": 1,
                    "nombre_tours_total": regle.nombre_tours,
                },
                status=status.HTTP_201_CREATED,
            )

        if next_member_to_pay(tontine, tour_en_cours) is not None:
            return Response(
                {
                    "detail": (
                        "Toutes les cotisations du tour ne sont pas encore réglées. "
                        "Attendez que chaque membre ait payé avant de clôturer."
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        numero_suivant = tour_en_cours.numero_du_tour + 1
        beneficiaire_suivant = None

        if numero_suivant <= regle.nombre_tours:
            # IMPORTANT : cette vérification doit précéder l'appel à
            # `_beneficiaire_pour_tour`. En mode ALÉATOIRE, cette dernière a
            # un effet de bord persistant (permutation d'`ordre_ramassage` +
            # `AuditLog` du tirage) qui n'est PAS annulé par un `return` — un
            # `return` normal à l'intérieur d'un `with transaction.atomic():`
            # déclenche un COMMIT, pas un rollback (seule une exception le
            # ferait). Si le tirage avait lieu avant ce contrôle, un tirage
            # serait donc committé alors même que le tour correspondant n'est
            # jamais créé (voir apps/tontine/tests/test_changer_tour.py,
            # `ChangerTourExistantTests`).
            if TourTontine.objects.filter(tontine=tontine, numero_du_tour=numero_suivant).exists():
                return Response(
                    {"detail": f"Le tour {numero_suivant} existe déjà."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            beneficiaire_suivant = _beneficiaire_pour_tour(
                tontine,
                regle,
                numero_suivant,
                exclude_user_ids={tour_en_cours.user_id},
                request_user=request.user,
            )
            if beneficiaire_suivant is None:
                return Response(
                    {
                        "detail": (
                            f"Impossible de déterminer le bénéficiaire du tour {numero_suivant}."
                        ),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        montant_cloture = _parse_positive_decimal(request.data.get("montant_depose"))
        if montant_cloture is None:
            montant_cloture = tour_en_cours.montant_depose or _pot_attendu(regle)

        tour_en_cours.montant_depose = montant_cloture
        tour_en_cours.statut_tour = TourTontine.STATUT_TOUR.TERMINE
        tour_en_cours.save(update_fields=["montant_depose", "statut_tour"])
        tour_cloture_data = _serialize_tour(tour_en_cours)

        AuditLog.objects.create(
            user=request.user,
            user_display=display_name_user(request.user),
            action=AuditLog.Action.ROUND_CLOSED,
            resource=(
                f"tontine:{tontine.pk}:tour:{tour_en_cours.pk}:"
                f"numero={tour_en_cours.numero_du_tour}:montant={montant_cloture}"
            ),
            status=AuditLog.Status.SUCCESS,
        )

        benef_wallet, _ = Wallet.objects.select_for_update().get_or_create(
            user=tour_en_cours.user
        )
        benef_wallet.solde_courant += montant_cloture
        benef_wallet.save(update_fields=["solde_courant"])
        ref_credit = _unique_ref("T")
        Transaction.objects.create(
            wallet=benef_wallet,
            solde_courant=benef_wallet.solde_courant,
            ref_transaction=ref_credit,
            mode_de_paiement=Transaction.MODE_DE_PAIEMENT.SOLDE_COTICI,
            montant_transaction=montant_cloture,
            statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
            type_transaction=Transaction.TYPE_TRANSACTION.DEPOT,
        )

        AuditLog.objects.create(
            user=tour_en_cours.user,
            user_display=display_name_user(tour_en_cours.user),
            action=AuditLog.Action.PAYOUT_EXECUTED,
            resource=(
                f"tontine:{tontine.pk}:tour:{tour_en_cours.pk}:"
                f"transaction:{ref_credit}:montant={montant_cloture}"
            ),
            status=AuditLog.Status.SUCCESS,
        )

        # Le bénéficiaire du tour reçoit l'argent — c'est lui qu'on notifie,
        # pas l'admin qui a déclenché le changement de tour.
        NotificationService.emit(
            destinataire=tour_en_cours.user,
            spec=spec_paiement_valide(
                kind="versement",
                montant=montant_cloture,
                ref=ref_credit,
                source_type="tontine",
                source_id=tontine.id,
            ),
        )

        if numero_suivant > regle.nombre_tours:
            tontine.est_active = False
            tontine.save(update_fields=["est_active"])
            tontine_terminee = True
        else:
            nouveau = TourTontine.objects.create(
                tontine=tontine,
                user=beneficiaire_suivant,
                numero_du_tour=numero_suivant,
                montant_depose=Decimal("0"),
                statut_tour=TourTontine.STATUT_TOUR.EN_COURS,
            )
            nouveau.date_echeance = tour_echeance(regle, nouveau)
            nouveau.save(update_fields=["date_echeance"])
            tour_suivant_data = _serialize_tour(nouveau)

            AuditLog.objects.create(
                user=request.user,
                user_display=display_name_user(request.user),
                action=AuditLog.Action.ROUND_STARTED,
                resource=f"tontine:{tontine.pk}:tour:{nouveau.pk}:numero={numero_suivant}",
                status=AuditLog.Status.SUCCESS,
            )

    detail = "Tontine terminée." if tontine_terminee else f"Passage au tour {numero_suivant}."

    return Response(
        {
            "detail": detail,
            "tontine_id": tontine.id,
            "tour_cloture": tour_cloture_data,
            "tour_suivant": tour_suivant_data,
            "tontine_terminee": tontine_terminee,
            "numero_tour_actuel": numero_suivant if not tontine_terminee else None,
            "nombre_tours_total": regle.nombre_tours,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def send_invitation(request):
    """Crée une invitation (hôte ou admin de la tontine uniquement)."""
    serializer = SendInvitationSerializer(data=request.data)
    if not serializer.is_valid():
        return _serializer_error_response(serializer)
    tontine_id = serializer.validated_data["tontine_id"]
    phone = serializer.validated_data["phone"]

    try:
        tontine = Tontine.objects.get(pk=tontine_id)
    except (Tontine.DoesNotExist, ValueError, TypeError):
        return Response({"detail": "Tontine introuvable."}, status=status.HTTP_404_NOT_FOUND)

    if not user_is_tontine_admin(request.user, tontine):
        return Response({"detail": "Seul l’hôte ou un administrateur peut inviter."}, status=status.HTTP_403_FORBIDDEN)

    token = secrets.token_hex(32)
    invitation = Invitations.objects.create(
        tontine=tontine,
        numero_telephone_invite=phone,
        token=token,
    )

    # Recherche EXACTE (pas d'icontains) : voir _resolve_user_by_phone_exact.
    # Si l'invité n'est pas encore inscrit chez COTICI, on ne fait rien — il
    # n'y a personne à notifier tant que le compte n'existe pas.
    invitee = _resolve_user_by_phone_exact(phone)
    if invitee is not None:
        NotificationService.emit(
            destinataire=invitee,
            expediteur=request.user,
            spec=spec_invitation_tontine(tontine_nom=tontine.description, tontine_id=tontine.id),
        )

    return Response(
        {
            "token": invitation.token,
            "tontine_id": tontine.id,
            "numero_telephone_invite": invitation.numero_telephone_invite,
            "statut_invitation": invitation.statut_invitation,
        },
        status=status.HTTP_201_CREATED,
    )



@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_tontines(request):
    """Tontines de groupe visibles (hors phase recrutement) pour l'utilisateur connecté."""
    user = request.user
    memberships = (
        TontineMembre.objects.filter(
            membre=user,
            statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
            tontine__type_tontine=Tontine.TYPE_TONTINE.GROUPE,
            tontine__etat=ETAT.ACTIF,
        )
        .select_related("tontine")
        .order_by("-tontine__date_creation")
    )
    results = []
    for membership in memberships:
        tontine = membership.tontine
        if tontine.etat != ETAT.ACTIF:
            continue
        regle = _get_regle(tontine)
        phase = compute_phase(tontine, regle)
        if phase == "recruiting":
            continue
        results.append(serialize_tontine_summary(tontine, regle, for_user=user))
    return Response({"count": len(results), "results": results})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_my_tontines_recruiting(request):
    """Tontines en recrutement (créateur ou membre)."""
    user = request.user
    memberships = (
        TontineMembre.objects.filter(
            membre=user,
            statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
            tontine__type_tontine=Tontine.TYPE_TONTINE.GROUPE,
            tontine__etat=ETAT.ACTIF,
        )
        .select_related("tontine")
        .order_by("-tontine__date_creation")
    )
    results = []
    for membership in memberships:
        tontine = membership.tontine
        regle = _get_regle(tontine)
        if compute_phase(tontine, regle) != "recruiting":
            continue
        results.append(serialize_tontine_summary(tontine, regle, for_user=user))
    return Response({"count": len(results), "results": results})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_tontine_detail(request):
    tontine_id = request.query_params.get("id") or request.query_params.get("tontine_id")
    if tontine_id in (None, ""):
        return Response({"detail": "id requis."}, status=status.HTTP_400_BAD_REQUEST)
    tontine, err = _get_tontine_for_member(
        request.user, tontine_id, type_filter=Tontine.TYPE_TONTINE.GROUPE
    )
    if err is not None:
        return err
    regle = _get_regle(tontine)
    return Response(serialize_tontine_detail(tontine, regle, request.user))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_chat_messages(request):
    """Messages de la discussion d'une tontine (membres actifs / admin uniquement)."""
    tontine_id = request.query_params.get("tontine_id") or request.query_params.get("id")
    if tontine_id in (None, ""):
        return Response({"detail": "tontine_id requis."}, status=status.HTTP_400_BAD_REQUEST)
    tontine, err = _get_tontine_for_member(request.user, tontine_id)
    if err is not None:
        return err

    qs = Chat.objects.filter(tontine=tontine).select_related("expediteur")

    after = request.query_params.get("after")
    after_id = _parse_positive_int(after) if after not in (None, "") else None
    if after_id is not None:
        # Poll incrémental : uniquement les nouveaux messages, pas de limite nécessaire.
        qs = qs.filter(id__gt=after_id).order_by("date")
    else:
        # Chargement initial : borne à l'historique récent pour éviter une réponse illimitée.
        qs = qs.order_by("-date")[:500]

    messages = [serialize_chat_message(m, for_user=request.user) for m in qs]
    if after_id is None:
        messages.reverse()
    return Response(
        {
            "results": messages,
            "tontine_id": tontine.id,
            "tontine_nom": display_name(tontine),
            "membres_actifs": active_members_count(tontine),
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def post_chat_message(request):
    """Publie un message dans la discussion d'une tontine."""
    serializer = PostChatMessageSerializer(data=request.data)
    if not serializer.is_valid():
        return _serializer_error_response(serializer)
    tontine_id = serializer.validated_data["tontine_id"]
    contenu = serializer.validated_data["contenu"]

    tontine, err = _get_tontine_for_member(request.user, tontine_id)
    if err is not None:
        return err

    message = Chat.objects.create(
        tontine=tontine,
        expediteur=request.user,
        contenu=contenu,
    )
    return Response(
        serialize_chat_message(message, for_user=request.user),
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def accept_invitation(request):
    serializer = AcceptInvitationSerializer(data=request.data)
    if not serializer.is_valid():
        return _serializer_error_response(serializer)
    token = serializer.validated_data["token"]
    tontine_id = serializer.validated_data["tontine_id"]

    invitation = None
    if token:
        try:
            invitation = Invitations.objects.select_related("tontine").get(
                token=token,
                est_utilisee=False,
                statut_invitation=Invitations.STATUT_INVITATION.EN_ATTENTE,
            )
        except Invitations.DoesNotExist:
            return Response({"detail": "Invitation invalide ou expirée."}, status=status.HTTP_404_NOT_FOUND)
        tontine = invitation.tontine
    else:
        try:
            tontine = Tontine.objects.get(
                pk=tontine_id,
                type_tontine=Tontine.TYPE_TONTINE.GROUPE,
            )
        except (Tontine.DoesNotExist, ValueError, TypeError):
            return Response({"detail": "Tontine introuvable."}, status=status.HTTP_404_NOT_FOUND)
        invitation = pending_invitation_for_user(tontine, request.user)
        if invitation is None:
            return Response(
                {"detail": "Aucune invitation en attente pour ce groupe."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    if tontine.type_tontine != Tontine.TYPE_TONTINE.GROUPE:
        return Response({"detail": "Type de tontine incorrect."}, status=status.HTTP_400_BAD_REQUEST)

    user = request.user
    if not phones_match(invitation.numero_telephone_invite, user):
        return Response(
            {"detail": "Cette invitation ne correspond pas à votre numéro."},
            status=status.HTTP_403_FORBIDDEN,
        )

    if TontineMembre.objects.filter(
        tontine=tontine, membre=user, statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF
    ).exists():
        return Response({"detail": "Vous êtes déjà membre de ce groupe."}, status=status.HTTP_400_BAD_REQUEST)

    regle = _get_regle(tontine)
    if regle is None:
        return Response(
            {"detail": "Les règles du groupe ne sont pas encore définies."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not _as_bool(request.data.get("accepte_regles")):
        return Response(
            {"detail": "Vous devez accepter les règles du groupe pour rejoindre."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if active_members_count(tontine) >= regle.nombre_max:
        return Response({"detail": "Le groupe est complet."}, status=status.HTTP_400_BAD_REQUEST)

    ordre = next_provisional_ordre(tontine, regle)
    if ordre is None:
        return Response({"detail": "Impossible d'attribuer un ordre de ramassage."}, status=status.HTTP_400_BAD_REQUEST)

    now = timezone.now()
    with transaction.atomic():
        TontineMembre.objects.create(
            tontine=tontine,
            membre=user,
            role_membre=TontineMembre.ROLE_MEMBRE.PARTICIPANT,
            statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
            ordre_ramassage=ordre,
            regles_acceptees=True,
            date_acceptation_regles=now,
        )
        invitation.statut_invitation = Invitations.STATUT_INVITATION.ACCEPTEE
        invitation.est_utilisee = True
        invitation.save(update_fields=["statut_invitation", "est_utilisee"])

    regle = _get_regle(tontine)
    return Response(
        {
            "detail": "Vous avez rejoint le groupe.",
            "tontine": serialize_tontine_detail(tontine, regle, user),
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_my_invitations(request):
    """Invitations en attente correspondant au numéro de l'utilisateur connecté."""
    user = request.user
    user_phone_suffix = _normalize_phone(str(getattr(user, "numero_telephone", "") or ""))[-10:]
    if not user_phone_suffix:
        return Response({"results": []})
    pending = (
        Invitations.objects.filter(
            statut_invitation=Invitations.STATUT_INVITATION.EN_ATTENTE,
            est_utilisee=False,
            tontine__type_tontine=Tontine.TYPE_TONTINE.GROUPE,
            numero_telephone_invite__endswith=user_phone_suffix,
        )
        .select_related("tontine", "tontine__hote")
        .order_by("-date_invitation")
    )
    results = []
    for inv in pending:
        if not phones_match(inv.numero_telephone_invite, user):
            continue
        if TontineMembre.objects.filter(
            tontine=inv.tontine,
            membre=user,
            statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
        ).exists():
            continue
        regle = _get_regle(inv.tontine)
        results.append(serialize_invitation(inv, regle))
    return Response({"results": results})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def preview_invitation(request):
    """Aperçu d'un groupe à partir d'un token (avant de rejoindre)."""
    id_serializer = TokenRequiredSerializer(data=request.query_params)
    if not id_serializer.is_valid():
        return _serializer_error_response(id_serializer)
    token = id_serializer.validated_data["token"]
    try:
        invitation = Invitations.objects.select_related("tontine", "tontine__hote").get(
            token=token,
            est_utilisee=False,
            statut_invitation=Invitations.STATUT_INVITATION.EN_ATTENTE,
        )
    except Invitations.DoesNotExist:
        return Response({"detail": "Invitation invalide ou expirée."}, status=status.HTTP_404_NOT_FOUND)

    if not phones_match(invitation.numero_telephone_invite, request.user):
        return Response(
            {"detail": "Cette invitation ne correspond pas à votre numéro."},
            status=status.HTTP_403_FORBIDDEN,
        )

    regle = _get_regle(invitation.tontine)
    return Response(serialize_invitation(invitation, regle))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def refuse_invitation(request):
    """Décline une invitation reçue (la retire des invitations en attente)."""
    id_serializer = TokenRequiredSerializer(data=request.data)
    if not id_serializer.is_valid():
        return _serializer_error_response(id_serializer)
    token = id_serializer.validated_data["token"]
    try:
        invitation = Invitations.objects.select_related("tontine").get(
            token=token,
            est_utilisee=False,
            statut_invitation=Invitations.STATUT_INVITATION.EN_ATTENTE,
        )
    except Invitations.DoesNotExist:
        return Response({"detail": "Invitation introuvable."}, status=status.HTTP_404_NOT_FOUND)

    if not phones_match(invitation.numero_telephone_invite, request.user):
        return Response(
            {"detail": "Cette invitation ne correspond pas à votre numéro."},
            status=status.HTTP_403_FORBIDDEN,
        )

    invitation.est_utilisee = True
    invitation.save(update_fields=["est_utilisee"])
    return Response({"detail": "Invitation refusée."}, status=status.HTTP_200_OK)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def set_ordre_ramassage(request):
    id_serializer = TontineIdRequiredSerializer(data=request.data)
    if not id_serializer.is_valid():
        return _serializer_error_response(id_serializer)
    tontine_id = id_serializer.validated_data["tontine_id"]

    try:
        tontine = Tontine.objects.get(pk=tontine_id, type_tontine=Tontine.TYPE_TONTINE.GROUPE)
    except (Tontine.DoesNotExist, ValueError, TypeError):
        return Response({"detail": "Tontine introuvable."}, status=status.HTTP_404_NOT_FOUND)

    if not user_is_tontine_admin(request.user, tontine):
        return Response(
            {"detail": "Seul l'administrateur peut définir l'ordre."},
            status=status.HTTP_403_FORBIDDEN,
        )

    regle = _get_regle(tontine)
    if regle is None:
        return Response({"detail": "Règles non définies."}, status=status.HTTP_400_BAD_REQUEST)

    if regle.ordre_ramassage != TontineRegle.ORDRE_RAMASSAGE.DEFINI_PAR_ADMIN:
        return Response(
            {"detail": "L'ordre est géré automatiquement pour cette tontine."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not groupe_complet(tontine, regle):
        return Response(
            {
                "detail": (
                    f"Le groupe n'est pas complet "
                    f"({active_members_count(tontine)}/{regle.nombre_max})."
                ),
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    if TourTontine.objects.filter(tontine=tontine).exists():
        return Response(
            {"detail": "L'ordre ne peut plus être modifié après le début des tours."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    ordres_payload = request.data.get("ordres") or request.data.get("members")
    if not isinstance(ordres_payload, list) or not ordres_payload:
        return Response({"detail": "Liste ordres requise."}, status=status.HTTP_400_BAD_REQUEST)

    mapping = {}
    for item in ordres_payload:
        if not isinstance(item, dict):
            continue
        membre_pk = item.get("membre_id") or item.get("id")
        ordre_val = _parse_positive_int(item.get("ordre_ramassage") or item.get("ordre"))
        if membre_pk in (None, "") or ordre_val is None:
            continue
        mapping[int(membre_pk)] = ordre_val

    actifs = list(
        TontineMembre.objects.filter(
            tontine=tontine,
            statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
        )
    )
    if len(mapping) != len(actifs):
        return Response(
            {"detail": "Tous les membres actifs doivent avoir un ordre."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    expected = set(range(1, regle.nombre_max + 1))
    if set(mapping.values()) != expected:
        return Response(
            {"detail": f"L'ordre doit être une permutation de 1 à {regle.nombre_max}."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    actif_ids = {tm.id for tm in actifs}
    if set(mapping.keys()) != actif_ids:
        return Response({"detail": "Identifiants de membres invalides."}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        # Verrou sur la tontine puis RE-vérification des invariants sous verrou.
        # Les contrôles faits plus haut (tours inexistants, liste des membres
        # actifs) l'ont été hors verrou : sans cette seconde passe, un
        # `demarrer_tontine` ou une exclusion de membre concurrents pourraient
        # se glisser entre le contrôle et l'écriture, et l'ordre serait réécrit
        # APRÈS le démarrage du cycle — un administrateur pourrait alors
        # s'attribuer le rang d'un tour futur non encore joué.
        Tontine.objects.select_for_update().get(pk=tontine.pk)

        if TourTontine.objects.filter(tontine=tontine).exists():
            return Response(
                {"detail": "L'ordre ne peut plus être modifié après le début des tours."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        actifs = list(
            TontineMembre.objects.select_for_update().filter(
                tontine=tontine,
                statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
            )
        )
        if {tm.id for tm in actifs} != set(mapping.keys()):
            return Response(
                {
                    "detail": (
                        "La composition du groupe a changé pendant la publication. "
                        "Rechargez la liste des membres et réessayez."
                    ),
                },
                status=status.HTTP_409_CONFLICT,
            )

        # Écriture en deux passes (mêmes précautions que
        # `recompact_ordre_ramassage` / `assign_ordre_ramassage_tirage`) :
        # `ordre_ramassage` est contraint par `uniq_tontine_ordre_ramassage`,
        # donc appliquer le nouveau mapping ligne par ligne dans l'ordre
        # d'itération de `actifs` peut heurter cette contrainte dès que la
        # permutation demandée n'est pas triviale (ex. un swap : écrire la
        # nouvelle valeur d'un membre alors qu'un autre membre la détient
        # encore). On bascule d'abord tout le monde sur des valeurs négatives
        # (jamais en conflit, la contrainte ne portant que sur des rangs
        # positifs), puis on fixe les valeurs définitives.
        for tm in actifs:
            TontineMembre.objects.filter(pk=tm.pk).update(ordre_ramassage=-tm.pk)
        for tm in actifs:
            TontineMembre.objects.filter(pk=tm.pk).update(ordre_ramassage=mapping[tm.id])

    return Response(
        {
            "detail": "Ordre de ramassage publié.",
            "tontine": serialize_tontine_detail(tontine, regle, request.user),
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cotiser_tontine(request):
    id_serializer = TontineIdRequiredSerializer(data=request.data)
    if not id_serializer.is_valid():
        return _serializer_error_response(id_serializer)
    tontine_id = id_serializer.validated_data["tontine_id"]

    tontine, err = _get_tontine_for_member(
        request.user, tontine_id, type_filter=Tontine.TYPE_TONTINE.GROUPE
    )
    if err is not None:
        return err

    regle = _get_regle(tontine)
    if regle is None:
        return Response({"detail": "Règles non définies."}, status=status.HTTP_400_BAD_REQUEST)

    if not ordre_ramassage_pret(tontine, regle) and regle.ordre_ramassage == TontineRegle.ORDRE_RAMASSAGE.DEFINI_PAR_ADMIN:
        return Response(
            {"detail": "L'ordre de ramassage doit être publié avant les cotisations."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    tour = tour_en_cours(tontine)
    if tour is None:
        return Response(
            {"detail": "Aucun tour en cours. L'administrateur doit démarrer le cycle."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = request.user
    montant = _parse_positive_decimal(request.data.get("montant"))
    if montant is None:
        montant = regle.montant_cotisation
    if montant != regle.montant_cotisation:
        return Response(
            {
                "detail": (
                    f"La cotisation doit être de {regle.montant_cotisation} F "
                    "pour ce tour."
                ),
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    if Transaction.objects.filter(
        tour=tour,
        tontine=tontine,
        wallet__user=user,
        type_transaction=Transaction.TYPE_TRANSACTION.DEBIT,
        statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
    ).exists():
        return Response(
            {"detail": "Vous avez déjà réglé votre cotisation pour ce tour."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    next_tm = next_member_to_pay(tontine, tour)
    if next_tm is None:
        return Response(
            {"detail": "Toutes les cotisations de ce tour sont déjà réglées."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if next_tm.membre_id != user.id:
        name = f"{next_tm.membre.first_name or ''} {next_tm.membre.last_name or ''}".strip()
        who = name or next_tm.membre.numero_telephone or "un autre membre"
        return Response(
            {
                "detail": (
                    f"Ce n'est pas encore votre tour. C'est au tour de {who} "
                    f"(rang {next_tm.ordre_ramassage})."
                ),
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    mode = _resolve_payment_mode(request.data.get("mode_de_paiement"))
    if mode is None:
        mode = Transaction.MODE_DE_PAIEMENT.SOLDE_COTICI

    ref = ""
    with transaction.atomic():
        wallet, _ = Wallet.objects.select_for_update().get_or_create(user=user)

        # Recontrôle sous verrou : le check plus haut (ligne ~1190) est fait avant
        # l'acquisition de ce verrou, donc deux requêtes quasi simultanées du même
        # membre peuvent toutes deux le franchir. Le verrou sur le wallet sérialise
        # leur exécution ; ce recontrôle après acquisition empêche la double cotisation.
        if Transaction.objects.filter(
            tour=tour,
            tontine=tontine,
            wallet__user=user,
            type_transaction=Transaction.TYPE_TRANSACTION.DEBIT,
            statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
        ).exists():
            return Response(
                {"detail": "Vous avez déjà réglé votre cotisation pour ce tour."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if wallet.solde_courant < montant:
            return Response({"detail": "Solde insuffisant."}, status=status.HTTP_400_BAD_REQUEST)

        wallet.solde_courant -= montant
        wallet.save(update_fields=["solde_courant"])

        tour_locked = TourTontine.objects.select_for_update().get(pk=tour.pk)
        tour_locked.montant_depose += montant
        tour_locked.save(update_fields=["montant_depose"])

        ref = _unique_ref("C")
        Transaction.objects.create(
            wallet=wallet,
            tontine=tontine,
            tour=tour_locked,
            solde_courant=wallet.solde_courant,
            ref_transaction=ref,
            mode_de_paiement=mode,
            montant_transaction=montant,
            statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
            type_transaction=Transaction.TYPE_TRANSACTION.DEBIT,
        )

        AuditLog.objects.create(
            user=user,
            user_display=display_name_user(user),
            action=AuditLog.Action.CONTRIBUTION_RECORDED,
            resource=(
                f"tontine:{tontine.pk}:tour:{tour_locked.pk}:"
                f"transaction:{ref}:montant={montant}"
            ),
            status=AuditLog.Status.SUCCESS,
        )

        NotificationService.emit(
            destinataire=user,
            spec=spec_paiement_valide(
                kind="cotisation",
                montant=montant,
                ref=ref,
                source_type="tontine",
                source_id=tontine.id,
            ),
        )

    return Response(
        {
            "detail": "Cotisation enregistrée.",
            "ref_transaction": ref,
            "tontine": serialize_tontine_detail(tontine, _get_regle(tontine), user),
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def demarrer_tontine(request):
    """Alias explicite pour démarrer le tour 1 (même logique que changer_tour)."""
    return _changer_tour_impl(request)


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def archive_groupe_tontine(request):
    """Archive une tontine de groupe (organisateur, avant tour 1 ou cycle terminé)."""
    user = request.user

    id_serializer = GroupeIdSerializer(data=request.data)
    if not id_serializer.is_valid():
        return _serializer_error_response(id_serializer)
    tontine_id = id_serializer.validated_data["id"]

    with transaction.atomic():
        tontine, err = _get_groupe_for_admin(user, tontine_id, for_update=True)
        if err is not None:
            return err

        if tontine.etat != ETAT.ACTIF:
            return _groupe_not_found_response(user, tontine_id)

        regle = _get_regle(tontine)
        block_reason = groupe_retrait_bloque_raison(tontine, regle)
        if block_reason:
            return Response({"detail": block_reason}, status=status.HTTP_400_BAD_REQUEST)

        tontine.etat = ETAT.ARCHIVE
        tontine.est_active = False
        tontine.date_archivage = timezone.now()
        tontine.save(update_fields=["etat", "est_active", "date_archivage"])

    return Response(serialize_tontine_summary(tontine, regle, for_user=user))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def delete_groupe_tontine(request):
    """Suppression logique d'une tontine de groupe (organisateur)."""
    user = request.user

    id_serializer = GroupeIdSerializer(data=request.data)
    if not id_serializer.is_valid():
        return _serializer_error_response(id_serializer)
    tontine_id = id_serializer.validated_data["id"]

    with transaction.atomic():
        tontine, err = _get_groupe_for_admin(user, tontine_id, for_update=True)
        if err is not None:
            return err

        if tontine.etat == ETAT.SUPPRIME:
            return Response(
                {"detail": "Tontine déjà supprimée."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        regle = _get_regle(tontine)
        block_reason = groupe_retrait_bloque_raison(tontine, regle)
        if block_reason:
            return Response({"detail": block_reason}, status=status.HTTP_400_BAD_REQUEST)

        tontine.etat = ETAT.SUPPRIME
        tontine.est_active = False
        tontine.date_suppression = timezone.now()
        tontine.save(update_fields=["etat", "est_active", "date_suppression"])

    return Response(serialize_tontine_summary(tontine, regle, for_user=user))


# ---------------------------------------------------------------------------
# Gestion des membres (exclusion, rôle, listing) — organisateur uniquement
# sauf mention contraire.
# ---------------------------------------------------------------------------


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def exclude_member(request):
    """Exclut un membre actif d'une tontine de groupe (hôte / admin uniquement).

    Interdit si l'exclusion casserait l'équilibre financier d'un cycle déjà
    démarré (membre ayant déjà cotisé ou déjà été bénéficiaire d'un tour).
    """
    serializer = ExcludeMemberSerializer(data=request.data)
    if not serializer.is_valid():
        return _serializer_error_response(serializer)
    tontine_id = serializer.validated_data["tontine_id"]
    motif = serializer.validated_data["motif"]

    with transaction.atomic():
        tontine, err = _get_groupe_for_admin(request.user, tontine_id, for_update=True)
        if err is not None:
            return err

        target_tm = _resolve_tontine_member_any_status(tontine, serializer.validated_data)
        if target_tm is None:
            return Response(
                {
                    "detail": (
                        "Membre introuvable. "
                        "Indiquez user_id, membre_id ou numero_telephone."
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if target_tm.membre_id == tontine.hote_id:
            return Response(
                {"detail": "Impossible d'exclure l'hôte du groupe."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if target_tm.membre_id == request.user.id:
            return Response(
                {"detail": "Vous ne pouvez pas vous exclure vous-même."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if target_tm.statut_membre != TontineMembre.STATUT_MEMBRE.ACTIF:
            return Response(
                {"detail": "Ce membre a déjà quitté ou a déjà été exclu du groupe."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Un cycle démarré ne peut plus perdre un membre qui a déjà touché de
        # l'argent (cotisation versée au pot, ou pot déjà reçu) sans casser
        # l'équilibre financier des tours restants.
        if TourTontine.objects.filter(tontine=tontine).exists():
            if member_ever_paid(tontine, target_tm.membre_id) or member_ever_beneficiary(
                tontine, target_tm.membre_id
            ):
                return Response(
                    {
                        "detail": (
                            "Impossible d'exclure ce membre : le cycle est déjà démarré et "
                            "il a déjà cotisé et/ou déjà été bénéficiaire d'un tour. "
                            "Cela casserait l'équilibre financier de la tontine."
                        ),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        penalites_impayees = Penalite.objects.filter(
            tontine=tontine,
            user_id=target_tm.membre_id,
            est_reglee=False,
            est_annulee=False,
        ).aggregate(total=Sum("montant_due"))["total"] or Decimal("0")

        target_user = target_tm.membre
        target_tm.statut_membre = TontineMembre.STATUT_MEMBRE.EXCLU
        # Libère aussi le créneau `ordre_ramassage` occupé par ce membre :
        # la contrainte unique `uniq_tontine_ordre_ramassage` porte sur TOUTES
        # les lignes (actives ou non), pas seulement les actives. Un sentinel
        # négatif dérivé du pk (donc unique) évite toute collision avec les
        # valeurs positives 1..N réassignées ci-dessous par le recompactage.
        target_tm.ordre_ramassage = -(1_000_000 + target_tm.pk)
        target_tm.save(update_fields=["statut_membre", "ordre_ramassage"])

        # Recompacte ordre_ramassage des membres actifs restants pour rester
        # une permutation dense de 1..N (voir docstring du helper).
        recompact_ordre_ramassage(tontine)

        AuditLog.objects.create(
            user=request.user,
            user_display=display_name_user(request.user),
            action=AuditLog.Action.MEMBER_REMOVED,
            resource=(
                f"tontine:{tontine.pk}:membre:{target_tm.pk}"
                + (f":motif={motif}" if motif else "")
            ),
            status=AuditLog.Status.SUCCESS,
        )

        NotificationService.emit(
            destinataire=target_user,
            spec=spec_membre_exclu(
                tontine_nom=display_name(tontine), tontine_id=tontine.id, motif=motif
            ),
        )

        excluded_name = display_name_user(target_user)
        autres_membres = TontineMembre.objects.filter(
            tontine=tontine, statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF
        ).exclude(membre_id=target_user.id).select_related("membre")
        for tm in autres_membres:
            NotificationService.emit(
                destinataire=tm.membre,
                spec=spec_membre_exclu_annonce(
                    tontine_nom=display_name(tontine),
                    tontine_id=tontine.id,
                    membre_nom=excluded_name,
                ),
            )

        regle = _get_regle(tontine)

    return Response(
        {
            "detail": "Membre exclu du groupe.",
            "membre_exclu_id": target_user.id,
            "penalites_impayees": str(penalites_impayees),
            "tontine": serialize_tontine_detail(tontine, regle, request.user),
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def set_member_role(request):
    """Promeut ou rétrograde un membre actif (hôte uniquement)."""
    serializer = SetMemberRoleSerializer(data=request.data)
    if not serializer.is_valid():
        return _serializer_error_response(serializer)
    tontine_id = serializer.validated_data["tontine_id"]
    role = serializer.validated_data["role"]

    with transaction.atomic():
        tontine = (
            Tontine.objects.select_for_update()
            .filter(pk=tontine_id, type_tontine=Tontine.TYPE_TONTINE.GROUPE)
            .exclude(etat=ETAT.SUPPRIME)
            .first()
        )
        if tontine is None:
            return _groupe_not_found_response(request.user, tontine_id)

        # Seul l'hôte (et non n'importe quel administrateur) peut changer les
        # rôles : un administrateur promu ne doit pas pouvoir en promouvoir
        # d'autres ni se rétrograder mutuellement.
        if tontine.hote_id != request.user.id:
            return Response(
                {"detail": "Seul l'hôte du groupe peut modifier le rôle d'un membre."},
                status=status.HTTP_403_FORBIDDEN,
            )

        target_tm = _resolve_tontine_member(tontine, serializer.validated_data)
        if target_tm is None:
            return Response(
                {
                    "detail": (
                        "Membre introuvable ou inactif. "
                        "Indiquez user_id, membre_id ou numero_telephone."
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if target_tm.membre_id == tontine.hote_id:
            return Response(
                {"detail": "Le rôle de l'hôte ne peut pas être modifié."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if target_tm.role_membre == role:
            return Response(
                {"detail": "Ce membre a déjà ce rôle."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        target_tm.role_membre = role
        target_tm.save(update_fields=["role_membre"])

        AuditLog.objects.create(
            user=request.user,
            user_display=display_name_user(request.user),
            action=AuditLog.Action.TONTINE_UPDATED,
            resource=f"tontine:{tontine.pk}:membre:{target_tm.pk}:role={role}",
            status=AuditLog.Status.SUCCESS,
        )

        NotificationService.emit(
            destinataire=target_tm.membre,
            spec=spec_role_modifie(
                tontine_nom=display_name(tontine), tontine_id=tontine.id, nouveau_role=role
            ),
        )

    return Response(
        {
            "detail": "Rôle mis à jour.",
            "membre_id": target_tm.id,
            "user_id": target_tm.membre_id,
            "role": target_tm.role_membre,
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_members(request):
    """Liste des membres actifs d'une tontine de groupe.

    Accessible à tout membre actif (ou admin/hôte). Les champs de gestion
    (`peut_etre_exclu`, `motif_blocage_exclusion`) ne sont renseignés que si
    le demandeur est administrateur — un simple participant n'a pas à savoir
    qui peut être exclu ou non.
    """
    tontine_id = request.query_params.get("tontine_id")
    if tontine_id in (None, ""):
        return Response({"detail": "tontine_id requis."}, status=status.HTTP_400_BAD_REQUEST)

    tontine, err = _get_tontine_for_member(
        request.user, tontine_id, type_filter=Tontine.TYPE_TONTINE.GROUPE
    )
    if err is not None:
        return err

    is_admin = user_is_tontine_admin(request.user, tontine)
    cycle_demarre = TourTontine.objects.filter(tontine=tontine).exists()
    tour = tour_en_cours(tontine)
    paid_ids_tour_courant = member_user_ids_paid_for_tour(tontine, tour) if tour else set()

    membres_qs = (
        TontineMembre.objects.filter(
            tontine=tontine, statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF
        )
        .select_related("membre")
        .order_by("ordre_ramassage", "date_adhesion")
    )

    penalites_par_membre = {
        row["user_id"]: row["total"]
        for row in Penalite.objects.filter(
            tontine=tontine, est_reglee=False, est_annulee=False
        )
        .values("user_id")
        .annotate(total=Sum("montant_due"))
    }

    beneficiaires_ids = set(
        TourTontine.objects.filter(tontine=tontine).values_list("user_id", flat=True)
    )
    payeurs_ids = set(
        Transaction.objects.filter(
            tontine=tontine,
            type_transaction=Transaction.TYPE_TRANSACTION.DEBIT,
            statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
        ).values_list("wallet__user_id", flat=True)
    )

    results = []
    for tm in membres_qs:
        data = {
            "id": tm.id,
            "user_id": tm.membre_id,
            "name": display_name_user(tm.membre),
            "role": tm.role_membre,
            "statut": tm.statut_membre,
            "ordre_ramassage": tm.ordre_ramassage,
            "regles_acceptees": tm.regles_acceptees,
            "is_hote": tm.membre_id == tontine.hote_id,
            "penalites_impayees": str(
                penalites_par_membre.get(tm.membre_id, Decimal("0"))
            ),
            "a_cotise_tour_courant": tm.membre_id in paid_ids_tour_courant,
        }
        if is_admin:
            # Numéro de téléphone et champs de gestion réservés aux admins —
            # cohérent avec `serialize_member()` (helpers.py) qui n'expose que
            # `name`/`avatar` aux autres membres. Les exposer à tout membre
            # actif permettrait à un participant d'exfiltrer les numéros de
            # tout le groupe.
            data["numero_telephone"] = tm.membre.numero_telephone
            blocage = None
            if tm.membre_id == tontine.hote_id:
                blocage = "Impossible d'exclure l'hôte du groupe."
            elif cycle_demarre and (
                tm.membre_id in payeurs_ids or tm.membre_id in beneficiaires_ids
            ):
                blocage = (
                    "Ce membre a déjà cotisé et/ou été bénéficiaire d'un tour : "
                    "son exclusion casserait l'équilibre financier du cycle."
                )
            data["peut_etre_exclu"] = blocage is None
            data["motif_blocage_exclusion"] = blocage
        results.append(data)

    return Response({"count": len(results), "results": results})


# ---------------------------------------------------------------------------
# Modification des règles (hôte / admin uniquement)
# ---------------------------------------------------------------------------


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def modify_tontine_regle(request):
    """Modifie partiellement les règles d'une tontine de groupe (hôte / admin).

    Mutabilité :
    - Cycle démarré (≥1 `TourTontine` existant) : seuls `montant_penalite`,
      `delai_grace_heures` et `penalites_automatiques` restent modifiables,
      tout le reste est verrouillé (l'équilibre du cycle en cours dépend de
      `montant_cotisation`, `nombre_max`, `ordre_ramassage`, `frequence`) —
      ces trois champs n'affectent pas l'équilibre du pot.
    - Avant démarrage : tout est modifiable, sous réserve que `nombre_max` ne
      descende pas sous le nombre de membres actifs ni sous 2.
    - Changer `nombre_max`/`frequence`/`montant_cotisation` recalcule
      `nombre_tours`/`objectif_cotisation` (mêmes helpers qu'à la création).
    - Toute modification autre que `montant_penalite`/`delai_grace_heures`/
      `penalites_automatiques` remet à zéro l'acceptation des règles des
      membres actifs (hors hôte), qui devront ré-accepter.
    """
    CHAMPS_TOUJOURS_MODIFIABLES = {"montant_penalite", "delai_grace_heures", "penalites_automatiques"}

    serializer = ModifyTontineRegleSerializer(data=request.data)
    if not serializer.is_valid():
        return _serializer_error_response(serializer)
    tontine_id = serializer.validated_data["tontine_id"]
    provided = {k: v for k, v in serializer.validated_data.items() if k != "tontine_id"}

    with transaction.atomic():
        tontine, err = _get_groupe_for_admin(request.user, tontine_id, for_update=True)
        if err is not None:
            return err

        try:
            regle = TontineRegle.objects.select_for_update().get(tontine=tontine)
        except TontineRegle.DoesNotExist:
            return Response(
                {"detail": "Les règles de cette tontine ne sont pas encore définies."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        cycle_demarre = TourTontine.objects.filter(tontine=tontine).exists()

        if cycle_demarre:
            champs_interdits = sorted(set(provided.keys()) - CHAMPS_TOUJOURS_MODIFIABLES)
            if champs_interdits:
                return Response(
                    {
                        "detail": (
                            "Le cycle de cotisation a déjà démarré : seuls le montant de "
                            "la pénalité et son régime de recouvrement automatique "
                            "peuvent encore être modifiés."
                        ),
                        "champs_verrouilles": champs_interdits,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        # Validation croisée : activer les pénalités automatiques exige un
        # montant de pénalité strictement positif — combine la valeur fournie
        # dans CETTE requête (si présente) avec la valeur déjà en base (le
        # serializer ne peut pas le savoir, cette vue partielle si).
        penalites_automatiques_cible = provided.get(
            "penalites_automatiques", regle.penalites_automatiques
        )
        montant_penalite_cible = provided.get("montant_penalite", regle.montant_penalite)
        if penalites_automatiques_cible and not (montant_penalite_cible and montant_penalite_cible > 0):
            return Response(
                {
                    "detail": (
                        "Les pénalités automatiques nécessitent un montant de pénalité "
                        "strictement positif."
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        champs_modifies: list = []

        if "nombre_max" in provided:
            nouveau_nombre_max = provided["nombre_max"]
            actifs_count = active_members_count(tontine)
            if nouveau_nombre_max < 2:
                return Response(
                    {"detail": "Le nombre maximum de participants doit être d'au moins 2."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if nouveau_nombre_max < actifs_count:
                return Response(
                    {
                        "detail": (
                            "Impossible de réduire le nombre de participants en dessous "
                            f"du nombre de membres actifs ({actifs_count})."
                        ),
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            regle.nombre_max = nouveau_nombre_max
            champs_modifies.append("nombre_max")

        if "montant_cotisation" in provided:
            regle.montant_cotisation = provided["montant_cotisation"]
            champs_modifies.append("montant_cotisation")

        if "frequence" in provided:
            regle.frequence = provided["frequence"]
            champs_modifies.append("frequence")
            if provided["frequence"] == TontineRegle.FREQUENCE_COTISATION.PERSONNALISE:
                regle.frequence_personalise = provided.get("frequence_personnalise")
            else:
                regle.frequence_personalise = None
            if "frequence_personnalise" not in champs_modifies:
                champs_modifies.append("frequence_personnalise")
        elif "frequence_personnalise" in provided:
            regle.frequence_personalise = provided["frequence_personnalise"]
            champs_modifies.append("frequence_personnalise")

        if "ordre_ramassage" in provided:
            # Garanti hors cycle démarré (verrouillé plus haut sinon).
            regle.ordre_ramassage = provided["ordre_ramassage"]
            champs_modifies.append("ordre_ramassage")

        if "montant_penalite" in provided:
            regle.montant_penalite = provided["montant_penalite"]
            champs_modifies.append("montant_penalite")

        if "delai_grace_heures" in provided:
            regle.delai_grace_heures = provided["delai_grace_heures"]
            champs_modifies.append("delai_grace_heures")

        if "penalites_automatiques" in provided:
            regle.penalites_automatiques = provided["penalites_automatiques"]
            champs_modifies.append("penalites_automatiques")

        # Recalcul dérivé : nombre_tours / objectif_cotisation dépendent de
        # montant_cotisation et nombre_max (mêmes règles qu'à la création).
        if "nombre_max" in provided or "montant_cotisation" in provided:
            if tontine.type_tontine == Tontine.TYPE_TONTINE.GROUPE:
                try:
                    regle.nombre_tours = regles_groupe_nombre_tours(regle.nombre_max)
                    regle.objectif_cotisation = regles_groupe_objectif_stocke(
                        regle.montant_cotisation, regle.nombre_max
                    )
                except ValueError:
                    return Response(
                        {"detail": "Impossible de recalculer les règles avec ces montants."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
            else:
                try:
                    regle.nombre_tours = compute_nombre_tours(
                        regle.objectif_cotisation, regle.montant_cotisation, regle.nombre_max
                    )
                except ValueError:
                    return Response(
                        {"detail": "Impossible de recalculer le nombre de tours avec ces montants."},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

        regle.save()

        # Toute modification substantielle (hors régime de pénalité) invalide
        # l'acceptation des règles déjà données par les membres actifs :
        # l'hôte n'a pas besoin de ré-accepter ses propres décisions. Comme
        # `montant_penalite`, `delai_grace_heures`/`penalites_automatiques`
        # ne réinitialisent PAS `regles_acceptees` (n'affectent pas l'équilibre
        # du pot).
        if set(champs_modifies) - CHAMPS_TOUJOURS_MODIFIABLES:
            TontineMembre.objects.filter(
                tontine=tontine, statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF
            ).exclude(membre_id=tontine.hote_id).update(
                regles_acceptees=False, date_acceptation_regles=None
            )

        AuditLog.objects.create(
            user=request.user,
            user_display=display_name_user(request.user),
            action=AuditLog.Action.RULE_UPDATED,
            resource=f"tontine:{tontine.pk}:regle:{regle.pk}:champs={','.join(champs_modifies)}",
            status=AuditLog.Status.SUCCESS,
        )

        destinataires = TontineMembre.objects.filter(
            tontine=tontine, statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF
        ).exclude(membre_id=request.user.id).select_related("membre")
        for tm in destinataires:
            NotificationService.emit(
                destinataire=tm.membre,
                spec=spec_regles_modifiees(
                    tontine_nom=display_name(tontine),
                    tontine_id=tontine.id,
                    champs_modifies=champs_modifies,
                ),
            )

    return Response(
        {
            "detail": "Règles mises à jour.",
            "regle": _serialize_regle(regle),
            "champs_modifies": champs_modifies,
        },
        status=status.HTTP_200_OK,
    )


# ---------------------------------------------------------------------------
# Pénalités : consultation, règlement, annulation
# ---------------------------------------------------------------------------


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_penalites(request):
    """Liste des pénalités d'une tontine de groupe.

    Anti-IDOR : un membre non-admin ne voit QUE ses propres pénalités ; un
    admin/hôte voit celles de tout le groupe.

    Filtres optionnels : `?statut=impayees|reglees|toutes`, `?tour_id=`,
    `?source=auto|manuelle`.
    """
    tontine_id = request.query_params.get("tontine_id")
    if tontine_id in (None, ""):
        return Response({"detail": "tontine_id requis."}, status=status.HTTP_400_BAD_REQUEST)

    tontine, err = _get_tontine_for_member(
        request.user, tontine_id, type_filter=Tontine.TYPE_TONTINE.GROUPE
    )
    if err is not None:
        return err

    statut = (request.query_params.get("statut") or "toutes").strip().lower()
    if statut not in ("impayees", "reglees", "toutes"):
        return Response(
            {"detail": "Statut invalide.", "allowed": ["impayees", "reglees", "toutes"]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    source = (request.query_params.get("source") or "").strip().lower()
    if source and source not in ("auto", "manuelle"):
        return Response(
            {"detail": "Source invalide.", "allowed": ["auto", "manuelle"]},
            status=status.HTTP_400_BAD_REQUEST,
        )

    base_qs = (
        Penalite.objects.filter(tontine=tontine)
        .exclude(est_annulee=True)
        .select_related("user", "tour")
    )
    is_admin = user_is_tontine_admin(request.user, tontine)
    if not is_admin:
        base_qs = base_qs.filter(user=request.user)

    tour_id = request.query_params.get("tour_id")
    if tour_id not in (None, ""):
        parsed_tour_id = _parse_positive_int(tour_id)
        if parsed_tour_id is None:
            return Response({"detail": "tour_id invalide."}, status=status.HTTP_400_BAD_REQUEST)
        base_qs = base_qs.filter(tour_id=parsed_tour_id)

    if source == "auto":
        base_qs = base_qs.filter(est_automatique=True)
    elif source == "manuelle":
        base_qs = base_qs.filter(est_automatique=False)

    total_impaye = base_qs.filter(est_reglee=False).aggregate(total=Sum("montant_due"))[
        "total"
    ] or Decimal("0")
    total_impaye_auto = base_qs.filter(est_reglee=False, est_automatique=True).aggregate(
        total=Sum("montant_due")
    )["total"] or Decimal("0")

    qs = base_qs
    if statut == "impayees":
        qs = qs.filter(est_reglee=False)
    elif statut == "reglees":
        qs = qs.filter(est_reglee=True)
    qs = qs.order_by("-date_attribution_penalite")

    results = [_serialize_penalite(p) for p in qs]
    return Response(
        {
            "count": len(results),
            "results": results,
            "total_impaye": str(total_impaye),
            "total_impaye_auto": str(total_impaye_auto),
        }
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_my_penalites(request):
    """Pénalités de l'utilisateur connecté, toutes tontines confondues.

    Sert l'index partiel `idx_penalite_impayee_par_user`. Aucune notion
    d'administration ici : chacun ne voit que ses propres pénalités (pas de
    paramètre `tontine_id`, pas de vérification d'admin nécessaire).
    """
    qs = (
        Penalite.objects.filter(user=request.user)
        .exclude(est_annulee=True)
        .select_related("tontine", "tour")
        .order_by("-date_attribution_penalite")
    )

    statut = (request.query_params.get("statut") or "toutes").strip().lower()
    if statut not in ("impayees", "reglees", "toutes"):
        return Response(
            {"detail": "Statut invalide.", "allowed": ["impayees", "reglees", "toutes"]},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if statut == "impayees":
        qs = qs.filter(est_reglee=False)
    elif statut == "reglees":
        qs = qs.filter(est_reglee=True)

    total_impaye = (
        Penalite.objects.filter(user=request.user, est_reglee=False, est_annulee=False).aggregate(
            total=Sum("montant_due")
        )["total"]
        or Decimal("0")
    )

    results = []
    for p in qs:
        data = _serialize_penalite(p)
        data["tontine_nom"] = display_name(p.tontine)
        results.append(data)

    return Response({"count": len(results), "total_impaye": str(total_impaye), "results": results})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def regler_penalite(request):
    """Règle une pénalité — deux modes (voir `ReglerPenaliteSerializer`).

    REFONTE (deadlock fix) : l'ancienne implémentation verrouillait `Penalite`
    en premier, ordre inverse de celui imposé par le job de recouvrement
    automatique et par `cotiser_tontine` (`Wallet` -> `TourTontine` ->
    `Penalite`) — deadlock garanti sous charge concurrente. La résolution de
    `user_id`/`tour_id` et le contrôle des droits se font maintenant sur une
    lecture NON verrouillée, avant que le débit réel (mode `"wallet"`) ou le
    marquage (mode `"hors_application"`) n'acquièrent les verrous dans l'ordre
    canonique via `apps.tontine.services.penalties_service`.
    """
    serializer = ReglerPenaliteSerializer(data=request.data)
    if not serializer.is_valid():
        return _serializer_error_response(serializer)
    penalite_id = serializer.validated_data["penalite_id"]
    mode = serializer.validated_data["mode"]
    motif = serializer.validated_data["motif"]

    try:
        penalite = Penalite.objects.select_related("tontine", "user", "tour").get(pk=penalite_id)
    except Penalite.DoesNotExist:
        return Response({"detail": "Pénalité introuvable."}, status=status.HTTP_404_NOT_FOUND)

    is_admin = user_is_tontine_admin(request.user, penalite.tontine)
    is_owner = penalite.user_id == request.user.id

    if mode == "hors_application":
        if not is_admin:
            return Response(
                {"detail": "Seul l'hôte ou un administrateur peut régler une pénalité hors application."},
                status=status.HTTP_403_FORBIDDEN,
            )
    else:  # mode == "wallet" : le débit réel est toujours celui du DÉBITEUR.
        if not (is_admin or is_owner):
            return Response(
                {"detail": "Seul le débiteur ou un administrateur peut régler cette pénalité."},
                status=status.HTTP_403_FORBIDDEN,
            )
        if not penalite.tour_id:
            return Response(
                {
                    "detail": (
                        "Cette pénalité ne référence pas de tour : impossible de déterminer "
                        "le bénéficiaire. Réglez-la hors application."
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

    if penalite.est_annulee:
        return Response(
            {"detail": "Cette pénalité a été annulée, elle ne peut pas être réglée."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if penalite.est_reglee:
        return Response(
            {"detail": "Cette pénalité est déjà réglée."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if mode == "hors_application":
        try:
            marquer_penalite_reglee_hors_app(penalite, request.user, motif)
        except PenaliteDejaTraiteeError:
            return Response(
                {"detail": "Cette pénalité a déjà été traitée entre-temps."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        penalite.refresh_from_db()
        return Response(
            {"detail": "Pénalité réglée hors application.", "penalite": _serialize_penalite(penalite)},
            status=status.HTTP_200_OK,
        )

    try:
        regler_penalite_par_wallet(penalite, request.user)
    except PenaliteDejaTraiteeError:
        return Response(
            {"detail": "Cette pénalité a déjà été traitée entre-temps."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    except SoldeInsuffisantError as exc:
        # Le solde exact n'est exposé qu'au propriétaire de la pénalité. Un admin
        # peut déclencher le règlement de la pénalité d'un tiers : lui renvoyer le
        # `solde` du débiteur transformerait cet endpoint en oracle de solde
        # (rejouable après chaque dépôt/retrait) sur une donnée financière privée.
        payload = {
            "detail": "Solde insuffisant pour régler cette pénalité.",
            "montant_due": str(exc.montant_due),
        }
        if penalite.user_id == request.user.id:
            payload["solde"] = str(exc.solde)
        return Response(payload, status=status.HTTP_400_BAD_REQUEST)

    penalite.refresh_from_db()
    return Response(
        {"detail": "Pénalité réglée.", "penalite": _serialize_penalite(penalite)},
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def annuler_penalite(request):
    """Annule une pénalité attribuée par erreur (hôte / admin uniquement).

    Suppression logique (`est_annulee`) plutôt que physique : préserve la
    traçabilité de l'action d'origine (`AuditLog` de type
    `PENALTY_ASSIGNED`) référencée par son identifiant.

    Si la pénalité était déjà réglée (débit déjà effectué), l'annulation
    déclenche un REMBOURSEMENT réel (débit du bénéficiaire du tour, crédit du
    membre) via `rembourser_penalite` — sinon l'annulation logique laisserait
    le membre lésé du montant déjà prélevé.
    """
    serializer = PenaliteIdSerializer(data=request.data)
    if not serializer.is_valid():
        return _serializer_error_response(serializer)
    penalite_id = serializer.validated_data["penalite_id"]
    motif = (request.data.get("motif") or "").strip()

    try:
        penalite = Penalite.objects.select_related("tontine", "user", "tour").get(pk=penalite_id)
    except Penalite.DoesNotExist:
        return Response({"detail": "Pénalité introuvable."}, status=status.HTTP_404_NOT_FOUND)

    if not user_is_tontine_admin(request.user, penalite.tontine):
        return Response(
            {"detail": "Seul l'hôte ou un administrateur peut annuler une pénalité."},
            status=status.HTTP_403_FORBIDDEN,
        )

    if penalite.est_annulee:
        return Response(
            {"detail": "Cette pénalité est déjà annulée."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if penalite.est_reglee:
        if not penalite.tour_id:
            return Response(
                {
                    "detail": (
                        "Cette pénalité réglée ne référence pas de tour : le remboursement "
                        "automatique est impossible, régularisez manuellement puis "
                        "contactez le support."
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        try:
            rembourser_penalite(penalite, request.user, motif or "Annulation après règlement.")
        except PenaliteDejaTraiteeError:
            return Response(
                {"detail": "Cette pénalité a déjà été traitée entre-temps."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except RemboursementImpossibleError as exc:
            return Response(
                {
                    "detail": (
                        "Remboursement impossible : le bénéficiaire du tour n'a plus les "
                        "fonds nécessaires (déjà retirés). Une régularisation manuelle est requise."
                    ),
                    "solde_beneficiaire": str(exc.solde),
                    "montant_manquant": str(exc.montant_manquant),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        penalite.refresh_from_db()
        return Response(
            {"detail": "Pénalité annulée et remboursée.", "penalite": _serialize_penalite(penalite)},
            status=status.HTTP_200_OK,
        )

    with transaction.atomic():
        # NB : ne PAS `select_related("tour")` ici — `tour` est une FK
        # nullable, et PostgreSQL refuse `FOR UPDATE` sur le côté nullable
        # d'un LEFT OUTER JOIN (`FeatureNotSupported`). `_serialize_penalite`
        # ci-dessous accède à `penalite_locked.tour` en lazy-load si besoin
        # (au plus une requête supplémentaire, hors verrou).
        penalite_locked = (
            Penalite.objects.select_for_update()
            .select_related("tontine", "user")
            .get(pk=penalite.pk)
        )
        if penalite_locked.est_annulee:
            return Response(
                {"detail": "Cette pénalité est déjà annulée."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if penalite_locked.est_reglee:
            # Course avec un règlement concurrent entre la lecture non
            # verrouillée ci-dessus et l'acquisition de ce verrou : on ne peut
            # plus faire de simple annulation logique, il faut rembourser.
            return Response(
                {
                    "detail": (
                        "Cette pénalité vient d'être réglée entre-temps : réessayez "
                        "l'annulation (elle déclenchera un remboursement)."
                    ),
                },
                status=status.HTTP_409_CONFLICT,
            )

        penalite_locked.est_annulee = True
        penalite_locked.date_annulation = timezone.now()
        if motif:
            penalite_locked.motif = motif
        penalite_locked.save(update_fields=["est_annulee", "date_annulation", "motif"])

        AuditLog.objects.create(
            user=request.user,
            user_display=display_name_user(request.user),
            action=AuditLog.Action.PENALTY_CANCELLED,
            resource=(
                f"tontine:{penalite_locked.tontine_id}:membre:{penalite_locked.user_id}:"
                f"penalite:{penalite_locked.pk}"
            ),
            status=AuditLog.Status.SUCCESS,
        )

        NotificationService.emit(
            destinataire=penalite_locked.user,
            spec=spec_penalite_annulee(
                tontine_nom=display_name(penalite_locked.tontine),
                tontine_id=penalite_locked.tontine_id,
                montant=penalite_locked.montant_due,
            ),
        )

    return Response(
        {"detail": "Pénalité annulée.", "penalite": _serialize_penalite(penalite_locked)},
        status=status.HTTP_200_OK,
    )