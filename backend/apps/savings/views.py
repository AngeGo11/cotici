import dataclasses
from decimal import Decimal

from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import permission_classes, api_view
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.notifications.domain.catalog import spec_epargne_palier
from apps.notifications.domain.dedup import dedup_epargne_palier
from apps.notifications.services.notification_service import NotificationService
from apps.savings.models import EpargnePersonnelle
from apps.savings.serializers import (
    DepositSavingsSerializer,
    GoalIdSerializer,
    SavingsPayloadSerializer,
)
from apps.utils.utilitaires import _paginate_and_serialize, _unique_ref
from apps.wallet.models import Transaction, Wallet

# Paliers de progression notifiés une seule fois chacun (idempotence via
# dedup_epargne_palier) : un dépôt qui fait franchir plusieurs paliers d'un
# coup (ex. 40% -> 100%) déclenche bien les trois notifications, mais un
# retrait qui fait redescendre sous un palier déjà notifié, suivi d'un
# nouveau dépôt qui le refranchit, ne renotifie jamais (anti-oscillation).
_PALIERS_EPARGNE = (50, 80, 100)

ETAT = EpargnePersonnelle.ETAT


def health(request):
    return JsonResponse({"module": "savings", "status": "ok"})


def _dt_iso(value):
    return value.isoformat() if value else None


def _serialize_epargne(epargne):
    return {
        "id": epargne.id,
        "nom_projet": epargne.nom_projet,
        "objectif_cotisation": epargne.objectif_cotisation,
        "montant_courant": str(epargne.montant_courant),
        "date_creation": epargne.date_creation.isoformat(),
        "categorie": epargne.categorie or "",
        "duree": epargne.duree,
        "etat": epargne.etat,
        "objectif_atteint": epargne.objectif_atteint,
        "date_archivage": _dt_iso(epargne.date_archivage),
        "date_suppression": _dt_iso(epargne.date_suppression),
    }


def _emit_palier_notifications(epargne: EpargnePersonnelle, montant_avant: Decimal) -> None:
    """Émet une notification (idempotente) pour chaque palier de progression
    franchi par ce dépôt, événementiel (pas un job) : le pourcentage d'un
    objectif d'épargne ne change qu'à un dépôt.
    """
    objectif = Decimal(epargne.objectif_cotisation)
    if objectif <= 0:
        return
    pct_avant = (montant_avant / objectif) * 100
    pct_apres = (epargne.montant_courant / objectif) * 100
    for seuil in _PALIERS_EPARGNE:
        if pct_avant < seuil <= pct_apres:
            NotificationService.emit_idempotent(
                destinataire=epargne.hote,
                spec=dataclasses.replace(
                    spec_epargne_palier(
                        nom_projet=epargne.nom_projet, epargne_id=epargne.id, seuil=seuil
                    ),
                    dedup_key=dedup_epargne_palier(epargne_id=epargne.id, seuil=seuil),
                ),
            )


def _active_savings_qs(user):
    return EpargnePersonnelle.objects.filter(hote=user, etat=ETAT.ACTIF)


def _readable_savings_qs(user):
    """Objectifs actifs ou archivés (exclut les suppressions logiques)."""
    return EpargnePersonnelle.objects.filter(hote=user).exclude(etat=ETAT.SUPPRIME)


def _goal_not_found_response(user, goal_id):
    if EpargnePersonnelle.objects.filter(hote=user, id=goal_id, etat=ETAT.SUPPRIME).exists():
        return Response(
            {"detail": "Objectif supprimé."},
            status=status.HTTP_404_NOT_FOUND,
        )
    return Response(
        {"detail": "Objectif introuvable."},
        status=status.HTTP_404_NOT_FOUND,
    )


def _get_readable_goal(user, goal_id):
    epargne = _readable_savings_qs(user).filter(id=goal_id).first()
    if epargne is None:
        return None, _goal_not_found_response(user, goal_id)
    return epargne, None


def _require_zero_balance(epargne):
    if epargne.montant_courant > 0:
        return Response(
            {
                "detail": (
                    "Il reste de l'épargne sur cet objectif. "
                    "Retirez-la vers votre solde avant d'archiver ou supprimer."
                ),
            },
            status=status.HTTP_400_BAD_REQUEST,
        )
    return None


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_savings(request):
    epargnes = _active_savings_qs(request.user).order_by("-date_creation", "-id")
    return Response(_paginate_and_serialize(request, epargnes, _serialize_epargne))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_archived_savings(request):
    epargnes = (
        EpargnePersonnelle.objects.filter(hote=request.user, etat=ETAT.ARCHIVE)
        .order_by("-date_archivage", "-id")
    )
    return Response(_paginate_and_serialize(request, epargnes, _serialize_epargne))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_savings(request):
    user = request.user

    serializer = SavingsPayloadSerializer(data=request.data)
    if not serializer.is_valid():
        return Response({"detail": serializer.errors["detail"][0]}, status=status.HTTP_400_BAD_REQUEST)
    nom_projet = serializer.validated_data["nom_projet"]
    montant_cible = serializer.validated_data["montant_cible"]
    duree = serializer.validated_data["duree"]
    categorie = serializer.validated_data["categorie"]

    epargne = EpargnePersonnelle.objects.create(
        hote=user,
        nom_projet=nom_projet,
        objectif_cotisation=montant_cible,
        montant_courant=Decimal("0"),
        categorie=categorie,
        duree=duree,
        etat=ETAT.ACTIF,
    )

    return Response(
        {
            "id": epargne.id,
            "nom_projet": epargne.nom_projet,
            "montant_cible": montant_cible,
            "duree": duree,
            "categorie": categorie,
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_savings_detail(request):
    id_serializer = GoalIdSerializer(data=request.query_params)
    if not id_serializer.is_valid():
        return Response(
            {"detail": id_serializer.errors["detail"][0]}, status=status.HTTP_400_BAD_REQUEST
        )
    goal_id = id_serializer.validated_data["id"]

    epargne, err = _get_readable_goal(request.user, goal_id)
    if err is not None:
        return err

    return Response(_serialize_epargne(epargne))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def deposit_to_savings(request):
    user = request.user

    serializer = DepositSavingsSerializer(data=request.data)
    if not serializer.is_valid():
        return Response({"detail": serializer.errors["detail"][0]}, status=status.HTTP_400_BAD_REQUEST)
    goal_id = serializer.validated_data["id"]
    montant = serializer.validated_data["montant"]
    mode = serializer.validated_data["mode_de_paiement"]

    amount = Decimal(montant)
    ref = ""

    with transaction.atomic():
        epargne = (
            EpargnePersonnelle.objects.select_for_update()
            .filter(hote=user, id=goal_id, etat=ETAT.ACTIF)
            .first()
        )
        if epargne is None:
            return _goal_not_found_response(user, goal_id)

        reste = Decimal(epargne.objectif_cotisation) - epargne.montant_courant
        if amount > reste:
            return Response(
                {"detail": "Le montant ne peut pas dépasser le reste à épargner."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        wallet, _ = Wallet.objects.select_for_update().get_or_create(user=user)
        if wallet.solde_courant < amount:
            return Response(
                {"detail": "Solde insuffisant."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        wallet.solde_courant -= amount
        wallet.save(update_fields=["solde_courant"])

        montant_avant = epargne.montant_courant
        epargne.montant_courant += amount
        if epargne.montant_courant >= Decimal(epargne.objectif_cotisation):
            epargne.objectif_atteint = True
        epargne.save(update_fields=["montant_courant", "objectif_atteint"])
        _emit_palier_notifications(epargne, montant_avant)

        ref = _unique_ref("V")
        Transaction.objects.create(
            wallet=wallet,
            epargne=epargne,
            solde_courant=wallet.solde_courant,
            ref_transaction=ref,
            mode_de_paiement=mode,
            montant_transaction=amount,
            statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
            type_transaction=Transaction.TYPE_TRANSACTION.VERSEMENT_EPARGNE_PERSONNELLE,
        )

    return Response({**_serialize_epargne(epargne), "ref_transaction": ref})


@api_view(["PATCH"])
@permission_classes([IsAuthenticated])
def update_savings(request):
    id_serializer = GoalIdSerializer(data=request.data)
    if not id_serializer.is_valid():
        return Response(
            {"detail": id_serializer.errors["detail"][0]}, status=status.HTTP_400_BAD_REQUEST
        )
    goal_id = id_serializer.validated_data["id"]

    epargne = _active_savings_qs(request.user).filter(id=goal_id).first()
    if epargne is None:
        return _goal_not_found_response(request.user, goal_id)

    payload_serializer = SavingsPayloadSerializer(
        data=request.data, context={"montant_courant": epargne.montant_courant}
    )
    if not payload_serializer.is_valid():
        return Response(
            {"detail": payload_serializer.errors["detail"][0]}, status=status.HTTP_400_BAD_REQUEST
        )
    nom_projet = payload_serializer.validated_data["nom_projet"]
    montant_cible = payload_serializer.validated_data["montant_cible"]
    duree = payload_serializer.validated_data["duree"]
    categorie = payload_serializer.validated_data["categorie"]

    epargne.nom_projet = nom_projet
    epargne.objectif_cotisation = montant_cible
    epargne.duree = duree
    epargne.categorie = categorie
    epargne.save(update_fields=["nom_projet", "objectif_cotisation", "duree", "categorie"])

    return Response(_serialize_epargne(epargne))


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_transactions_for_savings(request):
    id_serializer = GoalIdSerializer(data=request.query_params)
    if not id_serializer.is_valid():
        return Response(
            {"detail": id_serializer.errors["detail"][0]}, status=status.HTTP_400_BAD_REQUEST
        )
    goal_id = id_serializer.validated_data["id"]

    epargne, err = _get_readable_goal(request.user, goal_id)
    if err is not None:
        return err

    transactions = (
        Transaction.objects.filter(
            epargne=epargne,
            type_transaction__in=[
                Transaction.TYPE_TRANSACTION.VERSEMENT_EPARGNE_PERSONNELLE,
                Transaction.TYPE_TRANSACTION.RETRAIT_EPARGNE_PERSONNELLE,
            ],
        )
        .select_related("wallet__user")
        .order_by("-date_transaction")
    )
    data = [
        {
            "ref_transaction": t.ref_transaction,
            "montant_transaction": str(t.montant_transaction),
            "numero_telephone": getattr(t.wallet.user, "numero_telephone", "") or "",
            "type_transaction": t.type_transaction,
            "statut_transaction": t.statut_transaction,
            "mode_de_paiement": t.mode_de_paiement,
            "date_transaction": t.date_transaction.isoformat(),
        }
        for t in transactions
    ]
    return Response({"count": len(data), "results": data})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def withdraw_from_savings(request):
    """Retrait vers le solde principal lorsque l'objectif est atteint."""
    user = request.user

    id_serializer = GoalIdSerializer(data=request.data)
    if not id_serializer.is_valid():
        return Response(
            {"detail": id_serializer.errors["detail"][0]}, status=status.HTTP_400_BAD_REQUEST
        )
    goal_id = id_serializer.validated_data["id"]

    ref = ""

    with transaction.atomic():
        epargne = (
            EpargnePersonnelle.objects.select_for_update()
            .filter(hote=user, id=goal_id, etat=ETAT.ACTIF)
            .first()
        )
        if epargne is None:
            return _goal_not_found_response(user, goal_id)

        objectif = Decimal(epargne.objectif_cotisation)
        if epargne.montant_courant < objectif:
            return Response(
                {
                    "detail": (
                        "L'objectif n'est pas encore atteint. "
                        "Vous ne pouvez retirer que lorsque l'épargne couvre l'objectif."
                    ),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        amount = epargne.montant_courant
        if amount <= 0:
            return Response(
                {"detail": "Aucun montant à retirer sur cet objectif."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        wallet, _ = Wallet.objects.select_for_update().get_or_create(user=user)

        wallet.solde_courant += amount
        wallet.save(update_fields=["solde_courant"])

        epargne.montant_courant = Decimal("0")
        epargne.save(update_fields=["montant_courant"])

        ref = _unique_ref("RE")
        Transaction.objects.create(
            wallet=wallet,
            epargne=epargne,
            solde_courant=wallet.solde_courant,
            ref_transaction=ref,
            mode_de_paiement=Transaction.MODE_DE_PAIEMENT.SOLDE_COTICI,
            montant_transaction=amount,
            statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
            type_transaction=Transaction.TYPE_TRANSACTION.RETRAIT_EPARGNE_PERSONNELLE,
        )

    return Response(
        {
            **_serialize_epargne(epargne),
            "ref_transaction": ref,
            "montant_retire": str(amount),
        }
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def archive_savings(request):
    user = request.user

    id_serializer = GoalIdSerializer(data=request.data)
    if not id_serializer.is_valid():
        return Response(
            {"detail": id_serializer.errors["detail"][0]}, status=status.HTTP_400_BAD_REQUEST
        )
    goal_id = id_serializer.validated_data["id"]

    with transaction.atomic():
        epargne = (
            EpargnePersonnelle.objects.select_for_update()
            .filter(hote=user, id=goal_id, etat=ETAT.ACTIF)
            .first()
        )
        if epargne is None:
            return _goal_not_found_response(user, goal_id)

        balance_err = _require_zero_balance(epargne)
        if balance_err is not None:
            return balance_err

        epargne.etat = ETAT.ARCHIVE
        epargne.date_archivage = timezone.now()
        epargne.save(update_fields=["etat", "date_archivage"])

    return Response(_serialize_epargne(epargne))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def delete_savings(request):
    """Suppression logique : l'objectif n'apparaît plus dans les listes."""
    user = request.user

    id_serializer = GoalIdSerializer(data=request.data)
    if not id_serializer.is_valid():
        return Response(
            {"detail": id_serializer.errors["detail"][0]}, status=status.HTTP_400_BAD_REQUEST
        )
    goal_id = id_serializer.validated_data["id"]

    with transaction.atomic():
        epargne = (
            EpargnePersonnelle.objects.select_for_update()
            .filter(hote=user, id=goal_id)
            .exclude(etat=ETAT.SUPPRIME)
            .first()
        )
        if epargne is None:
            return _goal_not_found_response(user, goal_id)

        if epargne.etat == ETAT.SUPPRIME:
            return Response(
                {"detail": "Objectif déjà supprimé."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        balance_err = _require_zero_balance(epargne)
        if balance_err is not None:
            return balance_err

        epargne.etat = ETAT.SUPPRIME
        epargne.date_suppression = timezone.now()
        epargne.save(update_fields=["etat", "date_suppression"])

    return Response(_serialize_epargne(epargne))
