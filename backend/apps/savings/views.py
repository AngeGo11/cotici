from decimal import Decimal

from django.http import JsonResponse
from rest_framework import status
from rest_framework.decorators import permission_classes, api_view
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.savings.models import EpargnePersonnelle


def health(request):
    return JsonResponse({"module": "savings", "status": "ok"})




def _parse_positive_int(value):
    if value in (None, ""):
        return None
    try:
        n = int(value)
    except (TypeError, ValueError):
        return None
    return n if n > 0 else None






@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_savings(request):
    liste_categorie = ["Voyage", "Projet", "Mariage", "Éducation", "Santé", "Autre"]
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

    categorie_choisie = (request.data.get("categorie") or "").strip()
    if categorie_choisie == "Autre":
        categorie = (request.data.get("value_categorie") or "").strip()
        if not categorie:
            return Response(
                {"detail": "Veuillez préciser la catégorie de votre projet."},
                status=status.HTTP_400_BAD_REQUEST,
            )
    elif categorie_choisie in liste_categorie:
        categorie = categorie_choisie
    else:
        return Response({"detail": "Catégorie invalide."}, status=status.HTTP_400_BAD_REQUEST)

    epargne = EpargnePersonnelle.objects.create(
        hote=user,
        nom_projet=nom_projet,
        objectif_cotisation=montant_cible,
        montant_courant=Decimal("0"),
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


