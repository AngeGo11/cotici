from decimal import Decimal

from django.db import transaction
from django.http import JsonResponse
from rest_framework import status
from rest_framework.decorators import permission_classes, api_view
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.savings.models import EpargnePersonnelle
from apps.utils.utilitaires import _resolve_payment_mode, _unique_ref, _parse_positive_int
from apps.wallet.models import Transaction, Wallet


def health(request):
    return JsonResponse({"module": "savings", "status": "ok"})


def _serialize_epargne(epargne):
    return {
        "id": epargne.id,
        "nom_projet": epargne.nom_projet,
        "objectif_cotisation": epargne.objectif_cotisation,
        "montant_courant": str(epargne.montant_courant),
        "date_creation": epargne.date_creation.isoformat(),
        "categorie": epargne.categorie or "",
        "duree": epargne.duree,
    }


VALID_CATEGORIES = ["Voyage", "Projet personnel", "Mariage", "Éducation", "Santé", "Autre"]


def _resolve_categorie(data):
    categorie_choisie = (data.get("categorie") or "").strip()
    if categorie_choisie == "Autre":
        categorie = (data.get("value_categorie") or "").strip()
        if not categorie:
            return None, Response(
                {"detail": "Veuillez préciser la catégorie de votre projet."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return categorie, None
    if categorie_choisie in VALID_CATEGORIES:
        return categorie_choisie, None
    return None, Response({"detail": "Catégorie invalide."}, status=status.HTTP_400_BAD_REQUEST)



@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_savings(request):
    epargnes = EpargnePersonnelle.objects.filter(hote=request.user).order_by(
        "-date_creation", "-id"
    )
    results = [_serialize_epargne(epargne) for epargne in epargnes]
    return Response({"count": len(results), "results": results})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_savings(request):
    user = request.user

    nom_projet = (request.data.get("nom_projet") or "").strip()
    if not nom_projet:
        return Response({"detail": "Le nom du projet est obligatoire."}, status=status.HTTP_400_BAD_REQUEST)

    montant_cible = _parse_positive_int(request.data.get("montant_cible"))
    if montant_cible is None:
        return Response({"detail": "Entrez le montant cible."}, status=status.HTTP_400_BAD_REQUEST)

    duree = _parse_positive_int(request.data.get("duree"))
    if duree is None:
        return Response({"detail": "Veuillez préciser la durée."}, status=status.HTTP_400_BAD_REQUEST)
    if duree <= 0:
        return Response({"detail": "La durée ne peut pas être négative ou égale à 0."}, status=status.HTTP_400_BAD_REQUEST)

    categorie, categorie_error = _resolve_categorie(request.data)
    if categorie_error is not None:
        return categorie_error

    epargne = EpargnePersonnelle.objects.create(
        hote=user,
        nom_projet=nom_projet,
        objectif_cotisation=montant_cible,
        montant_courant=Decimal("0"),
        categorie=categorie,
        duree=duree,
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
    goal_id = _parse_positive_int(request.query_params.get("id"))
    if goal_id is None:
        return Response(
            {"detail": "Identifiant d'objectif invalide."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    epargne = EpargnePersonnelle.objects.filter(hote=request.user, id=goal_id).first()
    if epargne is None:
        return Response(
            {"detail": "Objectif introuvable."},
            status=status.HTTP_404_NOT_FOUND,
        )

    return Response(_serialize_epargne(epargne))


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def deposit_to_savings(request):
    goal_id = _parse_positive_int(request.data.get("id"))
    user = request.user

    if goal_id is None:
        return Response(
            {"detail": "Identifiant d'objectif invalide."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    montant = _parse_positive_int(request.data.get("montant"))
    if montant is None:
        return Response({"detail": "Montant invalide."}, status=status.HTTP_400_BAD_REQUEST)

    mode = _resolve_payment_mode(request.data.get("mode_de_paiement"))
    if mode is None:
        return Response({"detail": "Mode de paiement inconnu."}, status=status.HTTP_400_BAD_REQUEST)

    amount = Decimal(montant)
    ref = ""

    with transaction.atomic():
        epargne = (
            EpargnePersonnelle.objects.select_for_update()
            .filter(hote=user, id=goal_id)
            .first()
        )
        if epargne is None:
            return Response(
                {"detail": "Objectif introuvable."},
                status=status.HTTP_404_NOT_FOUND,
            )

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

        epargne.montant_courant += amount
        epargne.save(update_fields=["montant_courant"])

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
    goal_id = _parse_positive_int(request.data.get("id"))
    if goal_id is None:
        return Response(
            {"detail": "Identifiant d'objectif invalide."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    epargne = EpargnePersonnelle.objects.filter(hote=request.user, id=goal_id).first()
    if epargne is None:
        return Response(
            {"detail": "Objectif introuvable."},
            status=status.HTTP_404_NOT_FOUND,
        )

    nom_projet = (request.data.get("nom_projet") or "").strip()
    if not nom_projet:
        return Response({"detail": "Le nom du projet est obligatoire."}, status=status.HTTP_400_BAD_REQUEST)

    montant_cible = _parse_positive_int(request.data.get("montant_cible"))
    if montant_cible is None:
        return Response({"detail": "Entrez le montant cible."}, status=status.HTTP_400_BAD_REQUEST)
    if montant_cible < epargne.montant_courant:
        return Response(
            {"detail": "Le montant cible ne peut pas être inférieur au montant déjà épargné."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    duree = _parse_positive_int(request.data.get("duree"))
    if duree is None:
        return Response({"detail": "Veuillez préciser la durée."}, status=status.HTTP_400_BAD_REQUEST)
    if duree <= 0:
        return Response({"detail": "La durée ne peut pas être négative ou égale à 0."}, status=status.HTTP_400_BAD_REQUEST)

    categorie, categorie_error = _resolve_categorie(request.data)
    if categorie_error is not None:
        return categorie_error

    epargne.nom_projet = nom_projet
    epargne.objectif_cotisation = montant_cible
    epargne.duree = duree
    epargne.categorie = categorie
    epargne.save(update_fields=["nom_projet", "objectif_cotisation", "duree", "categorie"])

    return Response(_serialize_epargne(epargne))

