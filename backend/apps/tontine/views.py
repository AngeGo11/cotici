import random
import re
import secrets
from decimal import Decimal, InvalidOperation
from typing import Optional

from django.db import transaction
from django.http import JsonResponse
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.tontine.models import (
    Invitations,
    Penalite,
    Tontine,
    TontineMembre,
    TontineRegle,
    TourTontine, Chat,
)
from apps.tontine.permissions import IsTontineAdmin, user_is_tontine_admin


def health(request):
    return JsonResponse({"module": "tontine", "status": "ok"})


def _normalize_phone(value: str) -> str:
    digits = re.sub(r"\D", "", value or "")
    return digits[-15:] if digits else ""


def _generate_qr_payload(tontine_id: int) -> str:
    """Jeton opaque pour le champ qr_code (max 500 caractères)."""
    suffix = secrets.token_urlsafe(48)
    raw = f"cotici:tontine:{tontine_id}:{suffix}"
    return raw[:500]


def _parse_positive_int(value):
    if value in (None, ""):
        return None
    try:
        n = int(value)
    except (TypeError, ValueError):
        return None
    return n if n > 0 else None


def _parse_positive_decimal(value):
    if value in (None, ""):
        return None
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None
    return amount if amount > 0 else None


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


def _beneficiaire_pour_tour(tontine: Tontine, regle: TontineRegle, numero_du_tour: int):
    if regle.ordre_ramassage == TontineRegle.ORDRE_RAMASSAGE.DEFINI_PAR_ADMIN:
        try:
            return TontineMembre.objects.select_related("membre").get(
                tontine=tontine,
                ordre_ramassage=numero_du_tour,
                statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
            ).membre
        except TontineMembre.DoesNotExist:
            return None

    deja_servis = set(
        TourTontine.objects.filter(
            tontine=tontine,
            statut_tour=TourTontine.STATUT_TOUR.TERMINE,
        ).values_list("user_id", flat=True)
    )
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
    return regle.objectif_cotisation * regle.nombre_max


def _serialize_regle(regle: TontineRegle) -> dict:
    return {
        "id": regle.id,
        "objectif_cotisation": str(regle.objectif_cotisation),
        "montant_penalite": str(regle.montant_penalite),
        "nombre_max": regle.nombre_max,
        "nombre_tours": regle.nombre_tours,
        "ordre_ramassage": regle.ordre_ramassage,
        "frequence": regle.frequence,
        "frequence_personnalise": regle.frequence_personalise,
    }


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsTontineAdmin])
def create_tontine(request):
    """Création par l’utilisateur connecté : il devient hôte et premier membre admin."""
    raw_type = (request.data.get("type_tontine") or request.data.get("tontine_type") or "").strip()
    valid_types = {c for c, _ in Tontine.TYPE_TONTINE.choices}
    if raw_type not in valid_types:
        return Response(
            {"detail": "Type de tontine invalide.", "allowed": list(valid_types)},
            status=status.HTTP_400_BAD_REQUEST,
        )

    description = (request.data.get("description") or "").strip()
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

    objectif_cotisation = _parse_positive_int(request.data.get("objectif_cotisation"))
    if objectif_cotisation is None:
        return Response(
            {"detail": "Montant de cotisation invalide ou absent."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    nombre_max = _parse_positive_int(request.data.get("nombre_max"))
    if nombre_max is None:
        return Response(
            {"detail": "Nombre maximum de participants invalide ou absent."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    nombre_tours = _parse_positive_int(request.data.get("nombre_tours"))
    if nombre_tours is None:
        nombre_tours = nombre_max

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
        montant_penalite=montant_penalite,
        nombre_max=nombre_max,
        nombre_tours=nombre_tours,
        ordre_ramassage=ordre_ramassage,
        frequence=frequence_choisie,
        frequence_personnalise=frequence_personnalise,
    )

    penalites_payload = {
        "active": inclure_penalite,
        "montant_penalite": montant_penalite,
    }

    return Response(
        {
            "tontine_id": tontine.id,
            "regles": _serialize_regle(regles),
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

        numero_suivant = tour_en_cours.numero_du_tour + 1
        beneficiaire_suivant = None

        if numero_suivant <= regle.nombre_tours:
            beneficiaire_suivant = _beneficiaire_pour_tour(tontine, regle, numero_suivant)
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
            montant_cloture = _pot_attendu(regle)

        tour_en_cours.montant_depose = montant_cloture
        tour_en_cours.statut_tour = TourTontine.STATUT_TOUR.TERMINE
        tour_en_cours.save(update_fields=["montant_depose", "statut_tour"])
        tour_cloture_data = _serialize_tour(tour_en_cours)

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
@permission_classes([IsAuthenticated, IsTontineAdmin])
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

