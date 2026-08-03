from decimal import Decimal
from typing import Optional

from django.contrib.auth import get_user_model
from django.db import transaction
from django.db.models import Sum
from django.http import JsonResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.audits.models import AuditLog
from apps.notifications.domain.catalog import spec_paiement_valide
from apps.notifications.services.notification_service import NotificationService
from apps.solidarity.models import Solidarity
from apps.solidarity.serializers import (
    CotiserSolidaritySerializer,
    CreateSolidaritySerializer,
    SolidarityIdSerializer,
    _resolve_user_by_phone,
)
from apps.tontine.helpers import display_name_user, phones_match
from apps.tontine.models import Tontine, TontineMembre
from apps.tontine.permissions import user_is_tontine_admin
from apps.utils.utilitaires import (
    _generate_qr_payload,
    _paginate_and_serialize,
    _unique_ref,
)
from apps.wallet.models import Transaction, Wallet

User = get_user_model()
ETAT = Tontine.ETAT


def health(request):
    return JsonResponse({"module": "solidarity", "status": "ok"})


def _get_solidarity_by_id(tontine_id, *, include_deleted: bool = False) -> Optional[Solidarity]:
    try:
        qs = Solidarity.objects.filter(
            pk=tontine_id,
            type_tontine=Tontine.TYPE_TONTINE.SOLIDAIRE,
        )
        if not include_deleted:
            qs = qs.exclude(etat=ETAT.SUPPRIME)
        return qs.get()
    except (Solidarity.DoesNotExist, ValueError, TypeError):
        return None


def _solidarity_not_found_response(user, solidarity_id):
    if Solidarity.objects.filter(
        hote=user, pk=solidarity_id, etat=ETAT.SUPPRIME
    ).exists():
        return Response(
            {"detail": "Collecte supprimée."},
            status=status.HTTP_404_NOT_FOUND,
        )
    return Response(
        {"detail": "Collecte introuvable."},
        status=status.HTTP_404_NOT_FOUND,
    )


def _solidarity_retrait_bloque_raison(solidarity: Solidarity) -> Optional[str]:
    if _nb_contributeurs(solidarity) > 0:
        return (
            "Impossible d'archiver ou supprimer une collecte ayant déjà des contributeurs."
        )
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
        solidarity.etat == ETAT.ACTIF
        and solidarity.est_active
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
        "etat": solidarity.etat,
        "date_archivage": (
            solidarity.date_archivage.isoformat() if solidarity.date_archivage else None
        ),
        "date_suppression": (
            solidarity.date_suppression.isoformat() if solidarity.date_suppression else None
        ),
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
    user = request.user
    serializer = CreateSolidaritySerializer(data=request.data, context={"user": user})
    if not serializer.is_valid():
        return Response({"detail": serializer.errors["detail"][0]}, status=status.HTTP_400_BAD_REQUEST)
    beneficiaire_phone = serializer.validated_data["beneficiaire_phone"]
    motif = serializer.validated_data["motif"]
    objectif = serializer.validated_data["objectif_collecte"]

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
        Solidarity.objects.filter(hote=request.user, etat=ETAT.ACTIF)
        .select_related("hote")
        .order_by("-date_creation")
    )
    return Response(
        _paginate_and_serialize(request, qs, lambda s: _serialize_solidarity(s, for_user=request.user))
    )


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
        Solidarity.objects.filter(pk__in=tontine_ids, etat=ETAT.ACTIF)
        .exclude(hote=user)
        .select_related("hote")
        .order_by("-date_creation")
    )

    def _serialize_with_contribution(solidarity):
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
        return data

    return Response(_paginate_and_serialize(request, qs, _serialize_with_contribution))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def cotiser_tontine(request):
    """Participation libre à une collecte solidaire (ouverte à tout utilisateur Cotici)."""
    serializer = CotiserSolidaritySerializer(data=request.data)
    if not serializer.is_valid():
        return Response({"detail": serializer.errors["detail"][0]}, status=status.HTTP_400_BAD_REQUEST)
    tontine_id = serializer.validated_data["tontine_id"]
    montant = serializer.validated_data["montant"]
    mode = serializer.validated_data["mode_de_paiement"]
    idempotency_key = serializer.validated_data["idempotency_key"]

    solidarity = _get_solidarity_by_id(tontine_id)
    if solidarity is None:
        return Response(
            {"detail": "Collecte solidaire introuvable."},
            status=status.HTTP_404_NOT_FOUND,
        )

    user = request.user

    if solidarity.etat != ETAT.ACTIF or not solidarity.est_active or solidarity.versement_effectue:
        return Response(
            {"detail": "Cette collecte est clôturée."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if phones_match(solidarity.beneficiaire_telephone, user):
        return Response(
            {"detail": "Le bénéficiaire ne peut pas contribuer à sa propre collecte."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    objectif = _get_objectif_collecte(solidarity)
    if objectif is None:
        return Response(
            {"detail": "Objectif de collecte invalide."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    ref = ""
    with transaction.atomic():
        # Verrouille la collecte elle-même (pas seulement le wallet du contributeur) :
        # sans ça, deux contributions concurrentes proches de l'objectif peuvent
        # toutes les deux passer le contrôle "objectif atteint" et le dépasser.
        solidarity_locked = Solidarity.objects.select_for_update().get(pk=solidarity.pk)

        if (
            solidarity_locked.etat != ETAT.ACTIF
            or not solidarity_locked.est_active
            or solidarity_locked.versement_effectue
        ):
            return Response(
                {"detail": "Cette collecte est clôturée."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if solidarity_locked.objectif_atteint:
            return Response(
                {"detail": "L'objectif de la collecte est déjà atteint."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        collecte_actuelle = _montant_collecte(solidarity_locked)
        if collecte_actuelle >= objectif:
            return Response(
                {"detail": "L'objectif de la collecte est déjà atteint."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        wallet, _ = Wallet.objects.select_for_update().get_or_create(user=user)

        # Idempotence : si cette clé client a déjà été utilisée pour ce wallet
        # (retry réseau, double-tap), on renvoie l'état correspondant à la
        # contribution déjà enregistrée sans débiter ni cotiser une seconde fois.
        # Vérification faite APRÈS le verrou sur le wallet (et sur la collecte)
        # pour empêcher une course entre deux requêtes concurrentes portant la
        # même clé.
        if idempotency_key:
            existing = Transaction.objects.filter(
                wallet=wallet, client_ref=idempotency_key
            ).first()
            if existing is not None:
                collecte_existing = _montant_collecte(solidarity_locked)
                return Response(
                    {
                        "detail": "Participation enregistrée.",
                        "ref_transaction": existing.ref_transaction,
                        "montant_collecte": str(collecte_existing),
                        "objectif_collecte": str(objectif),
                        "objectif_atteint": collecte_existing >= objectif,
                        "tontine": {
                            "id": solidarity.id,
                            "nom_contributeur": display_name_user(user),
                            "numero_contributeur": getattr(user, "numero_telephone", "") or "",
                            "montant_verse": str(existing.montant_transaction),
                        },
                        "idempotent_replay": True,
                    },
                    status=status.HTTP_200_OK,
                )

        if wallet.solde_courant < montant:
            return Response({"detail": "Solde insuffisant."}, status=status.HTTP_400_BAD_REQUEST)

        wallet.solde_courant -= montant
        wallet.save(update_fields=["solde_courant"])

        ref = _unique_ref("C")
        Transaction.objects.create(
            wallet=wallet,
            tontine=solidarity_locked,
            solde_courant=wallet.solde_courant,
            ref_transaction=ref,
            client_ref=idempotency_key,
            mode_de_paiement=mode,
            montant_transaction=montant,
            statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
            type_transaction=Transaction.TYPE_TRANSACTION.CONTRIBUTION_SOLIDAIRE,
        )

        nouvelle_collecte = collecte_actuelle + montant
        if nouvelle_collecte >= objectif and not solidarity_locked.objectif_atteint:
            solidarity_locked.objectif_atteint = True
            solidarity_locked.save(update_fields=["objectif_atteint"])

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

    if solidarity.etat != ETAT.ACTIF:
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

    beneficiaire = _resolve_user_by_phone(solidarity.beneficiaire_telephone)
    if beneficiaire is None:
        return Response(
            {"detail": "Le compte du bénéficiaire est introuvable."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    ref = ""
    ref_validation = ""
    with transaction.atomic():
        solidarity_locked = Solidarity.objects.select_for_update().get(pk=solidarity.pk)
        if solidarity_locked.versement_effectue:
            return Response(
                {"detail": "Le versement a déjà été effectué."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Recalculé sous verrou : une lecture avant le select_for_update() peut être
        # périmée par une contribution qui s'intercale, ce qui verserait un montant
        # inférieur à ce qui a réellement été débité aux contributeurs (perte de fonds).
        collecte = _montant_collecte(solidarity_locked)
        if collecte < objectif:
            return Response(
                {"detail": "L'objectif n'est pas encore atteint."},
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

        organizer = request.user
        org_wallet, _ = Wallet.objects.select_for_update().get_or_create(user=organizer)
        ref_validation = _unique_ref("A")
        Transaction.objects.create(
            wallet=org_wallet,
            tontine=solidarity_locked,
            solde_courant=org_wallet.solde_courant,
            ref_transaction=ref_validation,
            mode_de_paiement=Transaction.MODE_DE_PAIEMENT.SOLDE_COTICI,
            montant_transaction=collecte,
            statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
            type_transaction=Transaction.TYPE_TRANSACTION.VALIDATION_VERSEMENT_SOLIDAIRE,
        )

        solidarity_locked.versement_effectue = True
        solidarity_locked.objectif_atteint = True
        solidarity_locked.est_active = False
        solidarity_locked.save(
            update_fields=["versement_effectue", "objectif_atteint", "est_active"]
        )

        AuditLog.objects.create(
            user=beneficiaire,
            user_display=display_name_user(beneficiaire),
            action=AuditLog.Action.AID_DISBURSEMENT_EXECUTED,
            resource=(
                f"solidarity:{solidarity_locked.pk}:transaction:{ref}:montant={collecte}"
            ),
            status=AuditLog.Status.SUCCESS,
        )

        NotificationService.emit(
            destinataire=beneficiaire,
            spec=spec_paiement_valide(
                kind="versement",
                montant=collecte,
                ref=ref,
                source_type="solidarity",
                source_id=solidarity_locked.pk,
            ),
        )

    return Response(
        {
            "detail": "Versement effectué au bénéficiaire.",
            "ref_transaction": ref,
            "ref_validation": ref_validation,
            "montant_verse": str(collecte),
            "beneficiaire_nom": display_name_user(beneficiaire),
        },
        status=status.HTTP_201_CREATED,
    )




@api_view(["POST"])
@permission_classes([IsAuthenticated])
def archive_solidarity(request):
    """Archive une collecte solidaire sans contributeur (organisateur uniquement)."""
    user = request.user

    id_serializer = SolidarityIdSerializer(data=request.data)
    if not id_serializer.is_valid():
        return Response(
            {"detail": id_serializer.errors["detail"][0]}, status=status.HTTP_400_BAD_REQUEST
        )
    solidarity_id = id_serializer.validated_data["id"]

    with transaction.atomic():
        solidarity = (
            Solidarity.objects.select_for_update()
            .filter(hote=user, id=solidarity_id, etat=ETAT.ACTIF)
            .first()
        )
        if solidarity is None:
            return _solidarity_not_found_response(user, solidarity_id)

        block_reason = _solidarity_retrait_bloque_raison(solidarity)
        if block_reason:
            return Response({"detail": block_reason}, status=status.HTTP_400_BAD_REQUEST)

        solidarity.etat = ETAT.ARCHIVE
        solidarity.est_active = False
        solidarity.date_archivage = timezone.now()
        solidarity.save(update_fields=["etat", "est_active", "date_archivage"])

    return Response(_serialize_solidarity(solidarity, for_user=user))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def delete_solidarity(request):
    """Suppression logique d'une collecte solidaire (organisateur uniquement)."""
    user = request.user

    id_serializer = SolidarityIdSerializer(data=request.data)
    if not id_serializer.is_valid():
        return Response(
            {"detail": id_serializer.errors["detail"][0]}, status=status.HTTP_400_BAD_REQUEST
        )
    solidarity_id = id_serializer.validated_data["id"]

    with transaction.atomic():
        solidarity = (
            Solidarity.objects.select_for_update()
            .filter(hote=user, id=solidarity_id)
            .exclude(etat=ETAT.SUPPRIME)
            .first()
        )
        if solidarity is None:
            return _solidarity_not_found_response(user, solidarity_id)

        if solidarity.etat == ETAT.SUPPRIME:
            return Response(
                {"detail": "Collecte déjà supprimée."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        block_reason = _solidarity_retrait_bloque_raison(solidarity)
        if block_reason:
            return Response({"detail": block_reason}, status=status.HTTP_400_BAD_REQUEST)

        solidarity.etat = ETAT.SUPPRIME
        solidarity.est_active = False
        solidarity.date_suppression = timezone.now()
        solidarity.save(update_fields=["etat", "est_active", "date_suppression"])

    return Response(_serialize_solidarity(solidarity, for_user=user))

