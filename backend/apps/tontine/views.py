import random
import re
import secrets
from decimal import Decimal, InvalidOperation
from typing import Optional

from django.db import transaction
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
    _get_tontine_for_member,
)

from apps.tontine.models import (
    Invitations,
    Penalite,
    Tontine,
    TontineMembre,
    TontineRegle,
    TourTontine, Chat,
)
from apps.tontine.helpers import (
    active_members_count,
    compute_nombre_tours,
    regles_groupe_nombre_tours,
    regles_groupe_objectif_stocke,
    compute_phase,
    display_name,
    groupe_complet,
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
from apps.wallet.models import Transaction, Wallet


def health(request):
    return JsonResponse({"module": "tontine", "status": "ok"})



def _get_regle(tontine: Tontine):
    try:
        return tontine.tontineregle
    except TontineRegle.DoesNotExist:
        return None


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
        from apps.authn.models import User

        user = User.objects.filter(numero_telephone__icontains=phone[-10:]).first()
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


def _serialize_penalite(penalite: Penalite) -> dict:
    return {
        "id": penalite.id,
        "tontine_id": penalite.tontine_id,
        "user_id": penalite.user_id,
        "type_penalite": penalite.type_penalite,
        "montant_penalite": str(penalite.montant_penalite),
        "montant_due": str(penalite.montant_due),
        "est_reglee": penalite.est_reglee,
        "date_attribution_penalite": penalite.date_attribution_penalite.isoformat(),
        "date_reglement_penalite": (
            penalite.date_reglement_penalite.isoformat()
            if penalite.date_reglement_penalite
            else None
        ),
    }


def _as_bool(value) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return False
    return str(value).strip().lower() in ("1", "true", "yes", "oui")


def _resolve_ordre_ramassage(raw) -> Optional[str]:
    if raw is None or str(raw).strip() == "":
        return None
    key = str(raw).strip()
    aliases = {
        "admin": TontineRegle.ORDRE_RAMASSAGE.DEFINI_PAR_ADMIN,
        "random": TontineRegle.ORDRE_RAMASSAGE.ALEATOIRE,
        "aleatoire": TontineRegle.ORDRE_RAMASSAGE.ALEATOIRE,
        "défini par l'admin": TontineRegle.ORDRE_RAMASSAGE.DEFINI_PAR_ADMIN,
    }
    normalized = aliases.get(key.lower(), key)
    valid = {c for c, _ in TontineRegle.ORDRE_RAMASSAGE.choices}
    return normalized if normalized in valid else None


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
):
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
    return random.choice(eligibles).membre


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
    }


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_tontine(request):
    """Création par l’utilisateur connecté : il devient hôte et premier membre admin."""
    raw_type = (
        request.data.get("type_tontine")
        or request.data.get("tontine_type")
        or Tontine.TYPE_TONTINE.GROUPE
    ).strip()
    valid_types = {c for c, _ in Tontine.TYPE_TONTINE.choices}
    if raw_type not in valid_types:
        return Response(
            {"detail": "Type de tontine invalide.", "allowed": list(valid_types)},
            status=status.HTTP_400_BAD_REQUEST,
        )

    nom = (request.data.get("nom_projet") or request.data.get("nom") or "").strip()
    description = (request.data.get("description") or "").strip()
    if nom and description and description != nom:
        description = f"{nom} — {description}"
    elif nom:
        description = nom
    if not description:
        return Response({"detail": "La description est obligatoire."}, status=status.HTTP_400_BAD_REQUEST)
    if len(description) > 300:
        return Response(
            {"detail": "Description trop longue (300 caractères max)."},
            status=status.HTTP_400_BAD_REQUEST,
        )

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
    if not user.is_authenticated:
        return Response(
            {"detail": "Utilisateur non trouvé."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    tontine_id = request.data.get("tontine_id")
    if tontine_id in (None, ""):
        return Response({"detail": "tontine_id requis."}, status=status.HTTP_400_BAD_REQUEST)

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

    montant_cotisation = _parse_positive_int(
        request.data.get("montant_cotisation") or request.data.get("montant_par_participant")
    )
    if montant_cotisation is None:
        return Response(
            {"detail": "Montant par participant invalide ou absent."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    nombre_max = _parse_positive_int(request.data.get("nombre_max"))
    if nombre_max is None:
        return Response(
            {"detail": "Nombre maximum de participants invalide ou absent."},
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

    ordre_raw = request.data.get("ordre_choisie") or request.data.get("ordre_ramassage")
    ordre_ramassage = _resolve_ordre_ramassage(ordre_raw)
    if ordre_ramassage is None:
        return Response(
            {
                "detail": "Mode d'ordre de ramassage invalide.",
                "allowed": [c for c, _ in TontineRegle.ORDRE_RAMASSAGE.choices],
            },
            status=status.HTTP_400_BAD_REQUEST,
        )

    frequence_choisie = (request.data.get("frequence") or "").strip()
    valid_frequences = {c for c, _ in TontineRegle.FREQUENCE_COTISATION.choices}
    if frequence_choisie not in valid_frequences:
        return Response({"detail": "Fréquence invalide."}, status=status.HTTP_400_BAD_REQUEST)

    frequence_personnalise = None
    if frequence_choisie == TontineRegle.FREQUENCE_COTISATION.PERSONNALISE:
        frequence_personnalise = _parse_positive_int(
            request.data.get("value_frequence_personnalise")
            or request.data.get("frequence_personnalise")
        )
        if frequence_personnalise is None:
            return Response(
                {"detail": "Veuillez préciser la fréquence de cotisation (en jours)."},
                status=status.HTTP_400_BAD_REQUEST,
            )

    inclure_penalite = _as_bool(request.data.get("penalite"))
    montant_penalite = 0

    if inclure_penalite:
        type_penalite = (request.data.get("type_penalite") or "").strip()
        valid_types = {c for c, _ in Penalite.TYPE_PENALITE.choices}
        if type_penalite not in valid_types:
            return Response(
                {"detail": "Type de pénalité invalide.", "allowed": list(valid_types)},
                status=status.HTTP_400_BAD_REQUEST,
            )
        montant_penalite = _parse_positive_int(request.data.get("montant_penalite"))
        if montant_penalite is None:
            return Response(
                {"detail": "Montant de la pénalité obligatoire."},
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
    tontine_id = request.data.get("tontine_id")
    if tontine_id in (None, ""):
        return Response({"detail": "tontine_id requis."}, status=status.HTTP_400_BAD_REQUEST)

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

    type_penalite = (request.data.get("type_penalite") or "").strip()
    valid_types = {c for c, _ in Penalite.TYPE_PENALITE.choices}
    if type_penalite not in valid_types:
        return Response(
            {"detail": "Type de pénalité invalide.", "allowed": list(valid_types)},
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

    if Penalite.objects.filter(
        tontine=tontine,
        user=target_user,
        type_penalite=type_penalite,
        est_reglee=False,
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

    penalite = Penalite.objects.create(
        tontine=tontine,
        user=target_user,
        type_penalite=type_penalite,
        montant_penalite=montant_penalite,
        montant_due=montant_due,
        est_reglee=False,
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
    tontine_id = request.data.get("tontine_id")
    if tontine_id in (None, ""):
        return Response({"detail": "tontine_id requis."}, status=status.HTTP_400_BAD_REQUEST)

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

            beneficiaire = _beneficiaire_pour_tour(tontine, regle, 1)
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
            tour_suivant_data = _serialize_tour(nouveau)

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
            beneficiaire_suivant = _beneficiaire_pour_tour(
                tontine,
                regle,
                numero_suivant,
                exclude_user_ids={tour_en_cours.user_id},
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
            if TourTontine.objects.filter(tontine=tontine, numero_du_tour=numero_suivant).exists():
                return Response(
                    {"detail": f"Le tour {numero_suivant} existe déjà."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        montant_cloture = _parse_positive_decimal(request.data.get("montant_depose"))
        if montant_cloture is None:
            montant_cloture = tour_en_cours.montant_depose or _pot_attendu(regle)

        tour_en_cours.montant_depose = montant_cloture
        tour_en_cours.statut_tour = TourTontine.STATUT_TOUR.TERMINE
        tour_en_cours.save(update_fields=["montant_depose", "statut_tour"])
        tour_cloture_data = _serialize_tour(tour_en_cours)

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
            tour_suivant_data = _serialize_tour(nouveau)

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
    tontine_id = request.data.get("tontine_id")
    phone_raw = request.data.get("numero_telephone_invite") or request.data.get("telephone") or ""

    if tontine_id in (None, ""):
        return Response({"detail": "tontine_id requis."}, status=status.HTTP_400_BAD_REQUEST)

    phone = _normalize_phone(str(phone_raw))
    if not phone or len(phone) < 8:
        return Response({"detail": "Numéro de téléphone invalide."}, status=status.HTTP_400_BAD_REQUEST)
    if len(phone) > 15:
        return Response({"detail": "Numéro trop long (15 chiffres max)."}, status=status.HTTP_400_BAD_REQUEST)

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
        )
        .select_related("tontine")
        .order_by("-tontine__date_creation")
    )
    results = []
    for membership in memberships:
        tontine = membership.tontine
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

    qs = Chat.objects.filter(tontine=tontine).select_related("expediteur").order_by("date")

    after = request.query_params.get("after")
    if after not in (None, ""):
        after_id = _parse_positive_int(after)
        if after_id is not None:
            qs = qs.filter(id__gt=after_id)

    messages = [serialize_chat_message(m, for_user=request.user) for m in qs]
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
    tontine_id = request.data.get("tontine_id")
    if tontine_id in (None, ""):
        return Response({"detail": "tontine_id requis."}, status=status.HTTP_400_BAD_REQUEST)

    contenu = (request.data.get("contenu") or "").strip()
    if not contenu:
        return Response({"detail": "Le message ne peut pas être vide."}, status=status.HTTP_400_BAD_REQUEST)
    if len(contenu) > 255:
        return Response({"detail": "Message trop long (255 caractères max)."}, status=status.HTTP_400_BAD_REQUEST)

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
    token = (request.data.get("token") or "").strip()
    tontine_id = request.data.get("tontine_id")

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
    elif tontine_id not in (None, ""):
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
    else:
        return Response(
            {"detail": "token ou tontine_id requis."},
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
    pending = (
        Invitations.objects.filter(
            statut_invitation=Invitations.STATUT_INVITATION.EN_ATTENTE,
            est_utilisee=False,
            tontine__type_tontine=Tontine.TYPE_TONTINE.GROUPE,
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
    token = (request.query_params.get("token") or "").strip()
    if not token:
        return Response({"detail": "token requis."}, status=status.HTTP_400_BAD_REQUEST)
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
    token = (request.data.get("token") or "").strip()
    if not token:
        return Response({"detail": "token requis."}, status=status.HTTP_400_BAD_REQUEST)
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
    tontine_id = request.data.get("tontine_id")
    if tontine_id in (None, ""):
        return Response({"detail": "tontine_id requis."}, status=status.HTTP_400_BAD_REQUEST)

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
        for tm in actifs:
            tm.ordre_ramassage = mapping[tm.id]
            tm.save(update_fields=["ordre_ramassage"])

    return Response(
        {
            "detail": "Ordre de ramassage publié.",
            "tontine": serialize_tontine_detail(tontine, regle, request.user),
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cotiser_tontine(request):
    tontine_id = request.data.get("tontine_id")
    if tontine_id in (None, ""):
        return Response({"detail": "tontine_id requis."}, status=status.HTTP_400_BAD_REQUEST)

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



# Inclure la possibilité de definir le nombre de tour voulu