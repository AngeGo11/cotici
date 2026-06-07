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

from apps.cagnotte.models import Cagnotte
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


def _get_cagnotte_by_id(tontine_id) -> Optional[Cagnotte]:
    try:
        return Cagnotte.objects.get(
            pk=tontine_id,
            type_tontine=Tontine.TYPE_TONTINE.CAGNOTTE,
        )
    except (Solidarity.DoesNotExist, ValueError, TypeError):
        return None


def _montant_collecte(tontine: Tontine) -> Decimal:
    total = (
        Transaction.objects.filter(
            tontine=tontine,
            type_transaction=Transaction.TYPE_TRANSACTION.CONTRIBUTION_CAGNOTTE,
            statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
        ).aggregate(total=Sum("montant_transaction"))["total"]
    )
    return total or Decimal("0")


def _nb_contributeurs(tontine: Tontine) -> int:
    return (
        Transaction.objects.filter(
            tontine=tontine,
            type_transaction=Transaction.TYPE_TRANSACTION.CONTRIBUTION_CAGNOTTE,
            statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
        )
        .values("wallet_id")
        .distinct()
        .count()
    )


def _get_objectif_collecte(cagnotte: Cagnotte) -> Optional[Decimal]:
    if cagnotte.objectif_cotisation <= 0:
        return None
    return Decimal(cagnotte.objectif_cotisation)


def _serialize_cagnotte(cagnotte: Cagnotte, *, for_user=None) -> dict:
    objectif = Decimal(cagnotte.objectif_cotisation or 0)
    collecte = _montant_collecte(cagnotte)
    progression = 0
    if objectif > 0:
        progression = min(100, int((collecte / objectif) * 100))

    is_admin = user_is_tontine_admin(for_user, cagnotte) if for_user else False
    objectif_atteint = bool(cagnotte.objectif_atteint or (objectif > 0 and collecte >= objectif))

    peut_cotiser = bool(
        cagnotte.est_active
        and not cagnotte.recuperation_effectue
        and not objectif_atteint
    )
    peut_valider_versement = bool(
        is_admin and objectif_atteint and not cagnotte.recuperation_effectue
    )

    data = {
        "id": cagnotte.id,
        "type_tontine": cagnotte.type_tontine,
        "motif": (cagnotte.description or "").strip(),
        "objectif_collecte": int(objectif),
        "montant_collecte": int(collecte),
        "progression_pct": progression,
        "objectif_atteint": objectif_atteint,
        "recuperation_effectue": bool(cagnotte.recuperation_effectue),
        "est_active": bool(cagnotte.est_active),
        "nb_contributeurs": _nb_contributeurs(cagnotte),
        "organisateur_nom": display_name_user(cagnotte.hote),
        "qr_code": cagnotte.qr_code,
        "date_creation": cagnotte.date_creation.isoformat(),
        "est_organisateur": is_admin,
        "peut_cotiser": peut_cotiser,
        "peut_valider_versement": peut_valider_versement,
    }


    return data


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_cagnotte(request):
    """Création d'une tontine solidaire via le modèle Cagnotte."""
    nom_cagnotte = _normalize_phone(str(request.data.get("nom_cagnotte") or ""))
    if not nom_cagnotte:
        return Response(
            {"detail": "Le nom de la cagnotte est obligatoire."},
            status=status.HTTP_400_BAD_REQUEST,
        )



    description_projet = str(request.data.get("description_projet") or "").strip()
    if not description_projet:
        return Response(
            {"detail": "La description_projet est obligatoire."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if len(description_projet) > 300:
        return Response(
            {"detail": "Le description_projet est trop long (300 caractères max)."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    objectif = _parse_positive_int(request.data.get("objectif_collecte"))
    if objectif is None:
        return Response(
            {"detail": "L'objectif de la collecte doit être un montant entier positif."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = request.user


    with transaction.atomic():
        cagnotte = Cagnotte(
            hote=user,
            nom_cagnotte=nom_cagnotte,
            description=description_projet,
            objectif_cotisation=objectif,
            objectif_atteint=False,
            qr_code="pending",
        )
        cagnotte.save()
        cagnotte.qr_code = _generate_qr_payload(cagnotte.id)
        cagnotte.save(update_fields=["qr_code"])

        TontineMembre.objects.create(
            tontine=cagnotte,
            membre=user,
            role_membre=TontineMembre.ROLE_MEMBRE.ADMIN,
            statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
            ordre_ramassage=1,
        )

    return Response(
        {
            "id": cagnotte.id,
            "type_tontine": cagnotte.type_tontine,
            "nom_cagnotte": cagnotte.nom_cagnotte,
            "description": cagnotte.description,
            "qr_code": cagnotte.qr_code,
            "hote_id": cagnotte.hote_id,
            "objectif_collecte": objectif,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def cagnotte_preview(request, tontine_id):
    """Aperçu public d'une cagnotte (accessible à tout utilisateur connecté)."""
    cagnotte = _get_cagnotte_by_id(tontine_id)
    if cagnotte is None:
        return Response(
            {"detail": "Cagnotte introuvable."},
            status=status.HTTP_404_NOT_FOUND,
        )
    return Response(_serialize_cagnotte(cagnotte, for_user=request.user))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_my_cagnotte(request):
    """Cagnotte dont l'utilisateur connecté est l'organisateur/hôte."""
    qs = (
        Solidarity.objects.filter(hote=request.user)
        .order_by("-date_creation")
    )
    results = [_serialize_cagnotte(s, for_user=request.user) for s in qs]
    return Response({"count": len(results), "results": results})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_my_contributions_to_cagnotte(request):
    """Collectes solidaires auxquelles l'utilisateur a contribué (hors celles qu'il organise)."""
    user = request.user
    wallet = Wallet.objects.filter(user=user).first()
    if wallet is None:
        return Response({"count": 0, "results": []})

    tontine_ids = (
        Transaction.objects.filter(
            wallet=wallet,
            type_transaction=Transaction.TYPE_TRANSACTION.CONTRIBUTION_CAGNOTTE,
            statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
            tontine__type_tontine=Tontine.TYPE_TONTINE.CAGNOTTE,
        )
        .values_list("tontine_id", flat=True)
        .distinct()
    )

    qs = (
        Cagnotte.objects.filter(pk__in=tontine_ids)
        .exclude(hote=user)
        .order_by("-date_creation")
    )

    results = []
    for cagnotte in qs:
        data = _serialize_cagnotte(cagnotte, for_user=user)
        montant_user = (
            Transaction.objects.filter(
                wallet=wallet,
                tontine=cagnotte,
                type_transaction=Transaction.TYPE_TRANSACTION.CONTRIBUTION_CAGNOTTE,
                statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
            ).aggregate(total=Sum("montant_transaction"))["total"]
        )
        data["montant_contribue"] = int(montant_user or 0)
        results.append(data)

    return Response({"count": len(results), "results": results})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cotiser_tontine(request):
    """Participation libre à une cagnotte (ouverte à tout utilisateur Cotici)."""
    tontine_id = request.data.get("tontine_id")
    if tontine_id in (None, ""):
        return Response({"detail": "tontine_id requis."}, status=status.HTTP_400_BAD_REQUEST)

    cagnotte = _get_cagnotte_by_id(tontine_id)
    if cagnotte is None:
        return Response(
            {"detail": "Collecte solidaire introuvable."},
            status=status.HTTP_404_NOT_FOUND,
        )

    user = request.user

    if not cagnotte.est_active or cagnotte.recuperation_effectue:
        return Response(
            {"detail": "Cette collecte est clôturée."},
            status=status.HTTP_400_BAD_REQUEST,
        )


    montant = _parse_positive_decimal(request.data.get("montant"))
    if montant is None:
        return Response(
            {"detail": "Veuillez renseigner un montant de participation valide."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    objectif = _get_objectif_collecte(cagnotte)
    if objectif is None:
        return Response(
            {"detail": "Objectif de collecte invalide."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if cagnotte.objectif_atteint:
        return Response(
            {"detail": "L'objectif de la collecte est déjà atteint."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    collecte_actuelle = _montant_collecte(cagnotte)
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
            tontine=cagnotte,
            solde_courant=wallet.solde_courant,
            ref_transaction=ref,
            mode_de_paiement=mode,
            montant_transaction=montant,
            statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
            type_transaction=Transaction.TYPE_TRANSACTION.CONTRIBUTION_SOLIDAIRE,
        )

        nouvelle_collecte = collecte_actuelle + montant
        if nouvelle_collecte >= objectif and not cagnotte.objectif_atteint:
            cagnotte.objectif_atteint = True
            cagnotte.save(update_fields=["objectif_atteint"])

    nouvelle_collecte = collecte_actuelle + montant

    return Response(
        {
            "detail": "Participation enregistrée.",
            "ref_transaction": ref,
            "montant_collecte": str(nouvelle_collecte),
            "objectif_collecte": str(objectif),
            "objectif_atteint": nouvelle_collecte >= objectif,
            "tontine": {
                "id": cagnotte.id,
                "nom_contributeur": display_name_user(user),
                "numero_contributeur": getattr(user, "numero_telephone", "") or "",
                "montant_verse": str(montant),
            },
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def recuperation_collecte(request, tontine_id):
    """Versement de la collecte au bénéficiaire (organisateur/admin uniquement)."""
    cagnotte = _get_cagnotte_by_id(tontine_id)
    if cagnotte is None:
        return Response(
            {"detail": "Collecte solidaire introuvable."},
            status=status.HTTP_404_NOT_FOUND,
        )

    if not user_is_tontine_admin(request.user, cagnotte):
        return Response(
            {"detail": "Seul l'organisateur peut valider le versement."},
            status=status.HTTP_403_FORBIDDEN,
        )

    if cagnotte.recuperation_effectue:
        return Response(
            {"detail": "Le versement a déjà été effectué."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    objectif = _get_objectif_collecte(cagnotte)
    if objectif is None:
        return Response(
            {"detail": "Objectif de collecte invalide."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    collecte = _montant_collecte(cagnotte)
    if collecte < objectif:
        return Response(
            {"detail": "L'objectif n'est pas encore atteint."},
            status=status.HTTP_400_BAD_REQUEST,
        )



    ref = ""
    with transaction.atomic():
        cagnotte_locked = Cagnotte.objects.select_for_update().get(pk=cagnotte.pk)
        if cagnotte_locked.recuperation_effectue:
            return Response(
                {"detail": "Le versement a déjà été effectué."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        organizer = cagnotte_locked.hote
        benef_wallet, _ = Wallet.objects.select_for_update().get_or_create(user=organizer)
        benef_wallet.solde_courant += collecte
        benef_wallet.save(update_fields=["solde_courant"])

        ref = _unique_ref("V")
        Transaction.objects.create(
            wallet=benef_wallet,
            tontine=cagnotte_locked,
            solde_courant=benef_wallet.solde_courant,
            ref_transaction=ref,
            mode_de_paiement=Transaction.MODE_DE_PAIEMENT.SOLDE_COTICI,
            montant_transaction=collecte,
            statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
            type_transaction=Transaction.TYPE_TRANSACTION.VERSEMENT_SOLIDAIRE,
        )

        cagnotte_locked.recuperation_effectue = True
        cagnotte_locked.objectif_atteint = True
        cagnotte_locked.est_active = False
        cagnotte_locked.save(
            update_fields=["recuperation_effectue", "objectif_atteint", "est_active"]
        )

    return Response(
        {
            "detail": "Récupération de la collecte par l'organisateur.",
            "ref_transaction": ref,
            "montant_verse": str(collecte),
            "organisateur": display_name_user(organizer),
        },
        status=status.HTTP_201_CREATED,
    )

## Ajouter une verification de carte d'identité pour éviter que des gens utilisent deux comptes
## Ou autres verification