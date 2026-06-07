from decimal import Decimal, InvalidOperation
from uuid import uuid4

from typing import Optional

from django.contrib.auth import get_user_model
from django.db import transaction
from django.http import JsonResponse
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from apps.solidarity.models import Solidarity
from apps.tontine.helpers import display_name_user
from apps.utils.utilitaires import _normalize_phone, _parse_amount, _resolve_payment_mode, _unique_ref
from apps.wallet.models import Transaction, Wallet

User = get_user_model()


def health(request):
    return JsonResponse({"module": "wallet", "status": "ok"})


def _solidarity_beneficiaire_nom(tontine_id) -> Optional[str]:
    try:
        solidarity = Solidarity.objects.get(pk=tontine_id)
    except Solidarity.DoesNotExist:
        return None
    phone = _normalize_phone(str(solidarity.beneficiaire_telephone or ""))
    if not phone or len(phone) < 8:
        return None
    beneficiaire = User.objects.filter(numero_telephone__icontains=phone[-10:]).first()
    if beneficiaire is None:
        return None
    return display_name_user(beneficiaire)


def _serialize_wallet_transaction(tx: Transaction) -> dict:
    payload = {
        "ref_transaction": tx.ref_transaction,
        "montant_transaction": str(tx.montant_transaction),
        "numero_telephone": getattr(tx.wallet.user, "numero_telephone", "") or "",
        "type_transaction": tx.type_transaction,
        "statut_transaction": tx.statut_transaction,
        "mode_de_paiement": tx.mode_de_paiement,
        "date_transaction": tx.date_transaction.isoformat(),
    }
    if tx.tontine_id:
        motif = (tx.tontine.description or "").strip()
        if motif:
            payload["motif_collecte"] = motif
    if tx.type_transaction == Transaction.TYPE_TRANSACTION.VALIDATION_VERSEMENT_SOLIDAIRE:
        beneficiaire_nom = _solidarity_beneficiaire_nom(tx.tontine_id)
        if beneficiaire_nom:
            payload["beneficiaire_nom"] = beneficiaire_nom
    return payload


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_transaction_for_user(request):
    txs = (
        Transaction.objects.filter(wallet__user=request.user)
        .select_related("wallet__user", "tontine")
        .order_by("-date_transaction")[:50]
    )
    data = [_serialize_wallet_transaction(t) for t in txs]
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
