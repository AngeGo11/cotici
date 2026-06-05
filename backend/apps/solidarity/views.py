from django.db import transaction
from django.http import JsonResponse
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from apps.utils.utilitaires import _generate_qr_payload
from apps.tontine.models import Tontine, TontineMembre


def health(request):
    return JsonResponse({"module": "solidarity", "status": "ok"})


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def create_solidarity_tontine(request):
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

    beneficiaire = request.data.get("beneficiaire") or request.data.get("beneficiare").strip()
    if not beneficiaire:
        return Response({"detail": "Le numéro du bénéficiaire est obligatoire."}, status=status.HTTP_400_BAD_REQUEST)
    motif = request.data.get("motif")
    if not motif:
        return Response({"detail": "Le motif est obligatoire."}, status=status.HTTP_400_BAD_REQUEST)
    objectif_collecte = request.data.get("objectif_collecte")
    if not objectif_collecte:
        return Response({"detail": "L'objectif de la collecte est obligatoire."}, status=status.HTTP_400_BAD_REQUEST)

    user = request.user
    if not user:
        return Response({"detail": "Uitlisateur non authentifié."}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic:
        tontine = Tontine(
            hote=user,
            type_tontine=raw_type,
            description=motif,
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

# Create your views here.
