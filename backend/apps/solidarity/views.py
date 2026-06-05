from decimal import Decimal
from typing import Optional

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Sum
from django.http import JsonResponse
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.solidarity.models import Solidarity
from apps.tontine.helpers import display_name_user, phones_match
from apps.tontine.models import Tontine, TontineMembre
from apps.tontine.permissions import user_is_tontine_admin
from apps.utils.utilitaires import (
    _generate_qr_payload,
    _normalize_phone,
    _parse_positive_decimal,
    _parse_positive_int,
    _resolve_payment_mode,
    _unique_ref,
)
from apps.wallet.models import Transaction, Wallet

User = get_user_model()


def health(request):
    return JsonResponse({"module": "solidarity", "status": "ok"})


def _resolve_user_by_phone(phone_raw: str):
    phone = _normalize_phone(str(phone_raw or ""))
    if not phone or len(phone) < 8:
        return None
    return User.objects.filter(numero_telephone__icontains=phone[-10:]).first()


def _get_solidarity_by_id(tontine_id) -> Optional[Solidarity]:
    try:
        return Solidarity.objects.get(
            pk=tontine_id,
            type_tontine=Tontine.TYPE_TONTINE.SOLIDAIRE,
        )
    except (Solidarity.DoesNotExist, ValueError, TypeError):
        return None


def _montant_collecte(tontine: Tontine) -> Decimal:
    total = (
        Transaction.objects.filter(
            tontine=tontine,
            type_transaction=Transaction.TYPE_TRANSACTION.CONTRIBUTION_SOLIDAIRE,
            statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
        ).aggregate(total=Sum("montant_transaction"))["total"]
    )
    return total or Decimal("0")


def _nb_contributeurs(tontine: Tontine) -> int:
    return (
        Transaction.objects.filter(
            tontine=tontine,
            type_transaction=Transaction.TYPE_TRANSACTION.CONTRIBUTION_SOLIDAIRE,
            statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
        )
        .values("wallet_id")
        .distinct()
        .count()
    )


def _get_objectif_collecte(solidarity: Solidarity) -> Optional[Decimal]:
    if solidarity.objectif_cotisation <= 0:
        return None
    return Decimal(solidarity.objectif_cotisation)


def _serialize_solidarity(solidarity: Solidarity, *, for_user=None) -> dict:
    objectif = Decimal(solidarity.objectif_cotisation or 0)
    collecte = _montant_collecte(solidarity)
    progression = 0
    if objectif > 0:
        progression = min(100, int((collecte / objectif) * 100))

    est_beneficiaire = phones_match(solidarity.beneficiaire_telephone, for_user) if for_user else False
    is_admin = user_is_tontine_admin(for_user, solidarity) if for_user else False
    objectif_atteint = bool(solidarity.objectif_atteint or (objectif > 0 and collecte >= objectif))

    peut_cotiser = bool(
        solidarity.est_active
        and not solidarity.versement_effectue
        and not objectif_atteint
        and not est_beneficiaire
    )
    peut_valider_versement = bool(
        is_admin and objectif_atteint and not solidarity.versement_effectue
    )

    data = {
        "id": solidarity.id,
        "type_tontine": solidarity.type_tontine,
        "motif": (solidarity.description or "").strip(),
        "objectif_collecte": int(objectif),
        "montant_collecte": int(collecte),
        "progression_pct": progression,
        "objectif_atteint": objectif_atteint,
        "versement_effectue": bool(solidarity.versement_effectue),
        "est_active": bool(solidarity.est_active),
        "nb_contributeurs": _nb_contributeurs(solidarity),
        "organisateur_nom": display_name_user(solidarity.hote),
        "qr_code": solidarity.qr_code,
        "date_creation": solidarity.date_creation.isoformat(),
        "est_beneficiaire": est_beneficiaire,
        "est_organisateur": is_admin,
        "peut_cotiser": peut_cotiser,
        "peut_valider_versement": peut_valider_versement,
    }

    if is_admin:
        beneficiaire_user = _resolve_user_by_phone(solidarity.beneficiaire_telephone)
        data["beneficiaire_nom"] = display_name_user(beneficiaire_user)
        data["beneficiaire_telephone"] = (
            getattr(beneficiaire_user, "numero_telephone", None)
            or solidarity.beneficiaire_telephone
        )

    return data


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_solidarity_tontine(request):
    """Création d'une tontine solidaire via le modèle Solidarity (sans TontineRegle)."""
    beneficiaire_phone = _normalize_phone(str(request.data.get("beneficiaire") or ""))
    if not beneficiaire_phone:
        return Response(
            {"detail": "Le numéro du bénéficiaire est obligatoire."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if _resolve_user_by_phone(beneficiaire_phone) is None:
        return Response(
            {"detail": "Aucun compte Cotici trouvé pour ce numéro de bénéficiaire."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    motif = str(request.data.get("motif") or "").strip()
    if not motif:
        return Response(
            {"detail": "Le motif est obligatoire."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if len(motif) > 300:
        return Response(
            {"detail": "Le motif est trop long (300 caractères max)."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    objectif = _parse_positive_int(request.data.get("objectif_collecte"))
    if objectif is None:
        return Response(
            {"detail": "L'objectif de la collecte doit être un montant entier positif."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = request.user
    if phones_match(beneficiaire_phone, user):
        return Response(
            {"detail": "Le bénéficiaire ne peut pas être l'organisateur du groupe."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    with transaction.atomic():
        solidarity = Solidarity(
            hote=user,
            description=motif,
            beneficiaire_telephone=beneficiaire_phone,
            objectif_cotisation=objectif,
            objectif_atteint=False,
            qr_code="pending",
        )
        solidarity.save()
        solidarity.qr_code = _generate_qr_payload(solidarity.id)
        solidarity.save(update_fields=["qr_code"])

        TontineMembre.objects.create(
            tontine=solidarity,
            membre=user,
            role_membre=TontineMembre.ROLE_MEMBRE.ADMIN,
            statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
            ordre_ramassage=1,
        )

    return Response(
        {
            "id": solidarity.id,
            "type_tontine": solidarity.type_tontine,
            "description": solidarity.description,
            "qr_code": solidarity.qr_code,
            "hote_id": solidarity.hote_id,
            "objectif_collecte": objectif,
            "beneficiaire_trouve": True,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def solidarity_preview(request, tontine_id):
    """Aperçu public d'une collecte solidaire (accessible à tout utilisateur connecté)."""
    solidarity = _get_solidarity_by_id(tontine_id)
    if solidarity is None:
        return Response(
            {"detail": "Collecte solidaire introuvable."},
            status=status.HTTP_404_NOT_FOUND,
        )
    return Response(_serialize_solidarity(solidarity, for_user=request.user))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_my_solidarity(request):
    """Collectes solidaires dont l'utilisateur connecté est l'organisateur/hôte."""
    qs = (
        Solidarity.objects.filter(hote=request.user)
        .order_by("-date_creation")
    )
    results = [_serialize_solidarity(s, for_user=request.user) for s in qs]
    return Response({"count": len(results), "results": results})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_my_contributions(request):
    """Collectes solidaires auxquelles l'utilisateur a contribué (hors celles qu'il organise)."""
    user = request.user
    wallet = Wallet.objects.filter(user=user).first()
    if wallet is None:
        return Response({"count": 0, "results": []})

    tontine_ids = (
        Transaction.objects.filter(
            wallet=wallet,
            type_transaction=Transaction.TYPE_TRANSACTION.CONTRIBUTION_SOLIDAIRE,
            statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
            tontine__type_tontine=Tontine.TYPE_TONTINE.SOLIDAIRE,
        )
        .values_list("tontine_id", flat=True)
        .distinct()
    )

    qs = (
        Solidarity.objects.filter(pk__in=tontine_ids)
        .exclude(hote=user)
        .order_by("-date_creation")
    )

    results = []
    for solidarity in qs:
        data = _serialize_solidarity(solidarity, for_user=user)
        montant_user = (
            Transaction.objects.filter(
                wallet=wallet,
                tontine=solidarity,
                type_transaction=Transaction.TYPE_TRANSACTION.CONTRIBUTION_SOLIDAIRE,
                statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
            ).aggregate(total=Sum("montant_transaction"))["total"]
        )
        data["montant_contribue"] = int(montant_user or 0)
        results.append(data)

    return Response({"count": len(results), "results": results})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cotiser_tontine(request):
    """Participation libre à une collecte solidaire (ouverte à tout utilisateur Cotici)."""
    tontine_id = request.data.get("tontine_id")
    if tontine_id in (None, ""):
        return Response({"detail": "tontine_id requis."}, status=status.HTTP_400_BAD_REQUEST)

    solidarity = _get_solidarity_by_id(tontine_id)
    if solidarity is None:
        return Response(
            {"detail": "Collecte solidaire introuvable."},
            status=status.HTTP_404_NOT_FOUND,
        )

    user = request.user

    if not solidarity.est_active or solidarity.versement_effectue:
        return Response(
            {"detail": "Cette collecte est clôturée."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if phones_match(solidarity.beneficiaire_telephone, user):
        return Response(
            {"detail": "Le bénéficiaire ne peut pas contribuer à sa propre collecte."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    montant = _parse_positive_decimal(request.data.get("montant"))
    if montant is None:
        return Response(
            {"detail": "Veuillez renseigner un montant de participation valide."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    objectif = _get_objectif_collecte(solidarity)
    if objectif is None:
        return Response(
            {"detail": "Objectif de collecte invalide."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if solidarity.objectif_atteint:
        return Response(
            {"detail": "L'objectif de la collecte est déjà atteint."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    collecte_actuelle = _montant_collecte(solidarity)
    if collecte_actuelle >= objectif:
        return Response(
            {"detail": "L'objectif de la collecte est déjà atteint."},
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

        ref = _unique_ref("C")
        Transaction.objects.create(
            wallet=wallet,
            tontine=solidarity,
            solde_courant=wallet.solde_courant,
            ref_transaction=ref,
            mode_de_paiement=mode,
            montant_transaction=montant,
            statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
            type_transaction=Transaction.TYPE_TRANSACTION.CONTRIBUTION_SOLIDAIRE,
        )

        nouvelle_collecte = collecte_actuelle + montant
        if nouvelle_collecte >= objectif and not solidarity.objectif_atteint:
            solidarity.objectif_atteint = True
            solidarity.save(update_fields=["objectif_atteint"])

    nouvelle_collecte = collecte_actuelle + montant

    return Response(
        {
            "detail": "Participation enregistrée.",
            "ref_transaction": ref,
            "montant_collecte": str(nouvelle_collecte),
            "objectif_collecte": str(objectif),
            "objectif_atteint": nouvelle_collecte >= objectif,
            "tontine": {
                "id": solidarity.id,
                "nom_contributeur": display_name_user(user),
                "numero_contributeur": getattr(user, "numero_telephone", "") or "",
                "montant_verse": str(montant),
            },
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def verser_beneficiaire(request, tontine_id):
    """Versement de la collecte au bénéficiaire (organisateur/admin uniquement)."""
    solidarity = _get_solidarity_by_id(tontine_id)
    if solidarity is None:
        return Response(
            {"detail": "Collecte solidaire introuvable."},
            status=status.HTTP_404_NOT_FOUND,
        )

    if not user_is_tontine_admin(request.user, solidarity):
        return Response(
            {"detail": "Seul l'organisateur peut valider le versement."},
            status=status.HTTP_403_FORBIDDEN,
        )

    if solidarity.versement_effectue:
        return Response(
            {"detail": "Le versement a déjà été effectué."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    objectif = _get_objectif_collecte(solidarity)
    if objectif is None:
        return Response(
            {"detail": "Objectif de collecte invalide."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    collecte = _montant_collecte(solidarity)
    if collecte < objectif:
        return Response(
            {"detail": "L'objectif n'est pas encore atteint."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    beneficiaire = _resolve_user_by_phone(solidarity.beneficiaire_telephone)
    if beneficiaire is None:
        return Response(
            {"detail": "Le compte du bénéficiaire est introuvable."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    ref = ""
    with transaction.atomic():
        solidarity_locked = Solidarity.objects.select_for_update().get(pk=solidarity.pk)
        if solidarity_locked.versement_effectue:
            return Response(
                {"detail": "Le versement a déjà été effectué."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        benef_wallet, _ = Wallet.objects.select_for_update().get_or_create(user=beneficiaire)
        benef_wallet.solde_courant += collecte
        benef_wallet.save(update_fields=["solde_courant"])

        ref = _unique_ref("V")
        Transaction.objects.create(
            wallet=benef_wallet,
            tontine=solidarity_locked,
            solde_courant=benef_wallet.solde_courant,
            ref_transaction=ref,
            mode_de_paiement=Transaction.MODE_DE_PAIEMENT.SOLDE_COTICI,
            montant_transaction=collecte,
            statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
            type_transaction=Transaction.TYPE_TRANSACTION.VERSEMENT_SOLIDAIRE,
        )

        solidarity_locked.versement_effectue = True
        solidarity_locked.objectif_atteint = True
        solidarity_locked.est_active = False
        solidarity_locked.save(
            update_fields=["versement_effectue", "objectif_atteint", "est_active"]
        )

    return Response(
        {
            "detail": "Versement effectué au bénéficiaire.",
            "ref_transaction": ref,
            "montant_verse": str(collecte),
            "beneficiaire_nom": display_name_user(beneficiaire),
        },
        status=status.HTTP_201_CREATED,
    )
