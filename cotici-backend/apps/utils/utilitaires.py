import re
import secrets

from rest_framework import status
from rest_framework.pagination import PageNumberPagination
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


def _split_phone_prefix(numero_telephone: str, default_prefix: str) -> tuple[str, str]:
    """Découpe un numéro stocké (`User.numero_telephone`) en `(prefix, phone_local)`
    pour l'API Transfer CinetPay, qui attend l'indicatif pays et le numéro
    local séparément.

    Convention interne (voir `_normalize_phone`, utilisée à l'inscription) :
    le numéro est stocké en digits only, PARFOIS déjà préfixé par l'indicatif
    pays (ex "225090xxxxxxx"). Si le numéro commence déjà par `default_prefix`,
    on ne duplique pas l'indicatif ; sinon on le préfixe.
    """
    digits = _normalize_phone(numero_telephone)
    prefix = re.sub(r"\D", "", str(default_prefix or ""))
    if prefix and digits.startswith(prefix):
        return prefix, digits[len(prefix):]
    return prefix, digits


def _resolve_user_by_phone_exact(phone_raw: str):
    """Résout un utilisateur par numéro de téléphone, correspondance EXACTE.

    Remplace l'ancien pattern `numero_telephone__icontains=phone[-10:]`, qui
    pouvait faire correspondre n'importe quel numéro partageant les 10
    derniers chiffres (faux positifs, résolution du mauvais compte). La
    normalisation appliquée ici (digits only, 15 derniers caractères) est la
    même que celle utilisée à l'inscription (`RegisterSerializer`), pour que
    la valeur stockée en base et la valeur recherchée soient comparables.

    Retourne None si le numéro est absent/trop court ou si aucun compte ne
    correspond exactement.
    """
    from django.contrib.auth import get_user_model

    phone = _normalize_phone(str(phone_raw or ""))
    if not phone or len(phone) < 8:
        return None
    User = get_user_model()
    return User.objects.filter(numero_telephone=phone).first()


def _generate_qr_payload(tontine_id: int) -> str:
    """Jeton opaque pour le champ qr_code (max 500 caractères)."""
    suffix = secrets.token_urlsafe(48)
    raw = f"cotici:tontine:{tontine_id}:{suffix}"
    return raw[:500]



def _paginate_and_serialize(request, queryset, serialize_fn, *, page_size=20):
    """Pagine un queryset avec DRF et sérialise chaque élément de la page.

    Retourne {"count", "results", "next", "previous"} au lieu de charger la
    table entière en mémoire à chaque appel.
    """
    paginator = PageNumberPagination()
    paginator.page_size = page_size
    page = paginator.paginate_queryset(queryset, request)
    results = [serialize_fn(item) for item in page]
    return paginator.get_paginated_response(results).data


def _serializer_error_response(serializer, *, status_code=status.HTTP_400_BAD_REQUEST):
    """Reconstruit un body d'erreur plat depuis serializer.errors.

    DRF enveloppe chaque valeur de ValidationError({...}) dans une liste
    d'ErrorDetail. Pour les erreurs à un seul message ("detail": "..."), on
    déballe la liste pour retrouver une chaîne. Pour les listes à plusieurs
    éléments (ex: "allowed": [...]) on les conserve telles quelles.
    """
    body = {}
    for key, value in serializer.errors.items():
        if isinstance(value, list) and len(value) == 1:
            body[key] = value[0]
        else:
            body[key] = value
    return Response(body, status=status_code)


def _get_tontine_for_member(user, tontine_id, *, type_filter=None):
    try:
        tontine = Tontine.objects.get(pk=tontine_id)
    except (Tontine.DoesNotExist, ValueError, TypeError):
        return None, Response({"detail": "Tontine introuvable."}, status=status.HTTP_404_NOT_FOUND)
    if type_filter and tontine.type_tontine != type_filter:
        return None, Response({"detail": "Type de tontine incorrect."}, status=status.HTTP_400_BAD_REQUEST)
    if tontine.etat == Tontine.ETAT.SUPPRIME:
        return None, Response({"detail": "Tontine introuvable."}, status=status.HTTP_404_NOT_FOUND)
    if not user_is_active_member(user, tontine) and not user_is_tontine_admin(user, tontine):
        return None, Response({"detail": "Accès refusé."}, status=status.HTTP_403_FORBIDDEN)
    return tontine, None

