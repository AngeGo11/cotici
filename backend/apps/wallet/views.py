from decimal import Decimal, InvalidOperation
from uuid import uuid4

from django.db import transaction
from django.http import JsonResponse
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.utils.utilitaires import _parse_amount, _resolve_payment_mode, _unique_ref
from apps.wallet.models import Transaction, Wallet

def health(request):
    return JsonResponse({"module": "wallet", "status": "ok"})


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_transaction_for_user(request):
    txs = (
        Transaction.objects.filter(wallet__user=request.user)
        .select_related("wallet__user")
        .order_by("-date_transaction")[:50]
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
        for t in txs
    ]
    return Response({"count": len(data), "results": data})

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

        ref = _unique_ref("DEP")
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
