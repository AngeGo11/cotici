from decimal import Decimal

from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import permission_classes, api_view
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.savings.models import EpargnePersonnelle
from apps.utils.utilitaires import _resolve_payment_mode, _unique_ref, _parse_positive_int
from apps.wallet.models import Transaction, Wallet

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
    epargnes = _active_savings_qs(request.user).order_by("-date_creation", "-id")
    results = [_serialize_epargne(epargne) for epargne in epargnes]
    return Response({"count": len(results), "results": results})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def list_archived_savings(request):
    epargnes = (
        EpargnePersonnelle.objects.filter(hote=request.user, etat=ETAT.ARCHIVE)
        .order_by("-date_archivage", "-id")
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
    goal_id = _parse_positive_int(request.query_params.get("id"))
    if goal_id is None:
        return Response(
            {"detail": "Identifiant d'objectif invalide."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    epargne, err = _get_readable_goal(request.user, goal_id)
    if err is not None:
        return err

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

        epargne.montant_courant += amount
        if epargne.montant_courant >= Decimal(epargne.objectif_cotisation):
            epargne.objectif_atteint = True
        epargne.save(update_fields=["montant_courant", "objectif_atteint"])

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

    epargne = _active_savings_qs(request.user).filter(id=goal_id).first()
    if epargne is None:
        return _goal_not_found_response(request.user, goal_id)

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


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_transactions_for_savings(request):
    goal_id = _parse_positive_int(request.query_params.get("id"))
    if goal_id is None:
        return Response(
            {"detail": "Identifiant d'objectif invalide."},
            status=status.HTTP_400_BAD_REQUEST,
        )

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
    goal_id = _parse_positive_int(request.data.get("id"))
    user = request.user

    if goal_id is None:
        return Response(
            {"detail": "Identifiant d'objectif invalide."},
            status=status.HTTP_400_BAD_REQUEST,
        )

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
    goal_id = _parse_positive_int(request.data.get("id"))
    user = request.user

    if goal_id is None:
        return Response(
            {"detail": "Identifiant d'objectif invalide."},
            status=status.HTTP_400_BAD_REQUEST,
        )

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
    goal_id = _parse_positive_int(request.data.get("id"))
    user = request.user

    if goal_id is None:
        return Response(
            {"detail": "Identifiant d'objectif invalide."},
            status=status.HTTP_400_BAD_REQUEST,
        )

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
