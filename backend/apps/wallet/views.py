from decimal import Decimal, InvalidOperation
from uuid import uuid4

from django.db import transaction
from django.http import JsonResponse
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.wallet.models import Transaction, Wallet


def health(request):
    return JsonResponse({"module": "wallet", "status": "ok"})


def _parse_amount(value):
    if value in (None, ""):
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None


def _resolve_payment_mode(raw):
    if raw is None or str(raw).strip() == "":
        return Transaction.MODE_DE_PAIEMENT.SOLDE_COTICI
    key = str(raw).strip().upper()
    valid = {choice for choice, _ in Transaction.MODE_DE_PAIEMENT.choices}
    if key in valid:
        return key
    return None


def _unique_ref(prefix: str) -> str:
    """Référence unique, longueur max 25 (champ modèle)."""
    for _ in range(8):
        candidate = f"{prefix}{uuid4().hex}"[:25]
        if not Transaction.objects.filter(ref_transaction=candidate).exists():
            return candidate
    return f"{prefix}{uuid4().hex}"[:25]


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def deposit(request):
    user = request.user
    amount = _parse_amount(request.data.get("montant_depose"))
    if amount is None:
        return Response({"detail": "Montant invalide ou absent."}, status=400)
    if amount <= 0:
        return Response({"detail": "Le montant à déposer doit être supérieur à zéro."}, status=400)

    mode = _resolve_payment_mode(request.data.get("mode_de_paiement"))
    if mode is None:
        return Response({"detail": "Mode de paiement inconnu."}, status=400)

    with transaction.atomic():
        wallet, _ = Wallet.objects.select_for_update().get_or_create(user=user)
        ancien = wallet.solde_courant
        wallet.solde_courant = ancien + amount
        wallet.save(update_fields=["solde_courant"])

        ref = _unique_ref("D")
        Transaction.objects.create(
            wallet=wallet,
            solde_courant=wallet.solde_courant,
            ref_transaction=ref,
            mode_de_paiement=mode,
            montant_transaction=amount,
            statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
            type_transaction=Transaction.TYPE_TRANSACTION.DEPOT,
        )

    return Response(
        {
            "numero_telephone_utilise": getattr(user, "numero_telephone", "") or "",
            "ancien_solde": str(ancien),
            "montant_depot": str(amount),
            "nouveau_solde": str(wallet.solde_courant),
            "ref_transaction": ref,
        },
        status=200,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated])
def withdrawal(request):
    user = request.user
    raw_montant = request.data.get("montant_a_retirer")
    if raw_montant in (None, ""):
        raw_montant = request.data.get("montant_depose")
    amount = _parse_amount(raw_montant)
    if amount is None:
        return Response({"detail": "Montant invalide ou absent."}, status=400)
    if amount <= 0:
        return Response({"detail": "Le montant à retirer doit être supérieur à zéro."}, status=400)

    mode = _resolve_payment_mode(request.data.get("mode_de_paiement"))
    if mode is None:
        return Response({"detail": "Mode de paiement inconnu."}, status=400)

    with transaction.atomic():
        wallet, _ = Wallet.objects.select_for_update().get_or_create(user=user)
        ancien = wallet.solde_courant
        if ancien < amount:
            return Response({"detail": "Solde insuffisant."}, status=400)
        wallet.solde_courant = ancien - amount
        wallet.save(update_fields=["solde_courant"])

        ref = _unique_ref("R")
        Transaction.objects.create(
            wallet=wallet,
            solde_courant=wallet.solde_courant,
            ref_transaction=ref,
            mode_de_paiement=mode,
            montant_transaction=amount,
            statut_transaction=Transaction.STATUT_TRANSACTION.REUSSIE,
            type_transaction=Transaction.TYPE_TRANSACTION.RETRAIT,
        )

    return Response(
        {
            "numero_telephone_utilise": getattr(user, "numero_telephone", "") or "",
            "ancien_solde": str(ancien),
            "montant_retire": str(amount),
            "nouveau_solde": str(wallet.solde_courant),
            "ref_transaction": ref,
        },
        status=200,
    )
