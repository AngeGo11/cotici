import re
import secrets

from rest_framework import status
from rest_framework.response import Response

from apps.tontine.models import Tontine
from apps.tontine.permissions import user_is_tontine_admin
from apps.wallet.models import Transaction, Wallet
from decimal import Decimal, InvalidOperation
from uuid import uuid4

from apps.tontine.helpers import user_is_active_member


def _parse_amount(value):
    if value in (None, ""):
        return None
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None


def _parse_positive_decimal(value):
    if value in (None, ""):
        return None
    try:
        amount = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        return None
    return amount if amount > 0 else None


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

def _parse_positive_int(value):
    if value in (None, ""):
        return None
    try:
        n = int(value)
    except (TypeError, ValueError):
        return None
    return n if n > 0 else None




def _normalize_phone(value: str) -> str:
    digits = re.sub(r"\D", "", value or "")
    return digits[-15:] if digits else ""


def _generate_qr_payload(tontine_id: int) -> str:
    """Jeton opaque pour le champ qr_code (max 500 caractères)."""
    suffix = secrets.token_urlsafe(48)
    raw = f"cotici:tontine:{tontine_id}:{suffix}"
    return raw[:500]



def _get_tontine_for_member(user, tontine_id, *, type_filter=None):
    try:
        tontine = Tontine.objects.get(pk=tontine_id)
    except (Tontine.DoesNotExist, ValueError, TypeError):
        return None, Response({"detail": "Tontine introuvable."}, status=status.HTTP_404_NOT_FOUND)
    if type_filter and tontine.type_tontine != type_filter:
        return None, Response({"detail": "Type de tontine incorrect."}, status=status.HTTP_400_BAD_REQUEST)
    if not user_is_active_member(user, tontine) and not user_is_tontine_admin(user, tontine):
        return None, Response({"detail": "Accès refusé."}, status=status.HTTP_403_FORBIDDEN)
    return tontine, None

