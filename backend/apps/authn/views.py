from datetime import timedelta
import hashlib
import logging
import os
import secrets

from django.contrib.auth import authenticate
from django.contrib.auth import get_user_model
from django.http import JsonResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from .models import OtpChallenge
from .serializers import RegisterSerializer, RequestOtpSerializer, VerifyOtpSerializer
from apps.wallet.models import Wallet
from ..savings.models import EpargnePersonnelle
from ..tontine.models import Tontine, TontineMembre

logger = logging.getLogger(__name__)
OTP_LENGTH = 4
OTP_TTL_SECONDS = 300
OTP_MAX_ATTEMPTS = 5
User = get_user_model()


def _normalize_phone(value):
    return "".join(ch for ch in (value or "") if ch.isdigit())


def _username_candidates(username_or_phone):
    raw = (username_or_phone or "").strip()
    if not raw:
        return []
    candidates = [raw]
    digits = _normalize_phone(raw)
    if digits and digits not in candidates:
        candidates.append(digits)
    if digits.startswith("225") and len(digits) > 10:
        local = digits[3:]
        if local not in candidates:
            candidates.append(local)
    return candidates


def _hash_otp(challenge_id, otp_code):
    payload = f"{challenge_id}:{otp_code}"
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _mask_phone(phone):
    if len(phone) <= 4:
        return "*" * len(phone)
    return f"{phone[:2]}******{phone[-2:]}"


def _generate_otp():
    return f"{secrets.randbelow(10 ** OTP_LENGTH):0{OTP_LENGTH}d}"


def _send_sms(phone, otp_code):
    provider = os.getenv("SMS_PROVIDER", "console").lower()
    message = f"Votre code COTICI est {otp_code}. Il expire dans 5 minutes."
    if provider == "console":
        logger.warning("OTP SMS to %s: %s", phone, message)
        return
    # For real providers (Twilio, Orange, Infobip...), integrate API call here.
    logger.warning("Unknown SMS provider '%s'. Falling back to console.", provider)
    logger.warning("OTP SMS to %s: %s", phone, message)

def health(request):
    return JsonResponse({"module": "authn", "status": "ok"})


def count_tontine_actif(request):
    user = request.user
    if not user.is_authenticated:
        return Response(
            {"detail": "Utilisateur non trouvé."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return Tontine.objects.filter(
        tontinemembre__membre=user,
        tontinemembre__statut_membre=TontineMembre.STATUT_MEMBRE.ACTIF,
    ).distinct().count()

def count_tontine_by_user(request):
    user = request.user
    if not user.is_authenticated:
        return Response(
            {"detail": "Utilisateur non trouvé."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return Tontine.objects.filter(hote=user).count()

def count_savings(request):
    user = request.user
    if not user.is_authenticated:
        return Response(
            {"detail": "Utilisateur non trouvé."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return EpargnePersonnelle.objects.filter(
        hote=user,
    ).count()

@api_view(["POST"])
@permission_classes([AllowAny])
def register(request):
    serializer = RegisterSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user = serializer.save()
    wallet, _ = Wallet.objects.get_or_create(user=user)

    return Response(
        {
            "message": "Utilisateur créé",
            "user": {
                "user_id": user.id,
                "username": user.username,
                "nom_complet": user.get_full_name(),
                "email": user.email,
                "numero_telephone": user.numero_telephone,
                "solde": wallet.solde_courant,
            },
        },
        status=status.HTTP_201_CREATED,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def request_otp(request):
    serializer = RequestOtpSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    username_input = serializer.validated_data["username"].strip()
    password_or_pin = serializer.validated_data["password"]
    purpose = serializer.validated_data["purpose"]
    requested_phone = _normalize_phone(serializer.validated_data.get("numero_telephone", ""))
    requested_first_name = (serializer.validated_data.get("first_name", "") or "").strip()
    requested_last_name = (serializer.validated_data.get("last_name", "") or "").strip()
    requested_email = (serializer.validated_data.get("email", "") or "").strip()

    if purpose == OtpChallenge.PURPOSE_REGISTER:
        normalized_username = _normalize_phone(username_input)
        if not normalized_username:
            return Response(
                {"detail": "Numero de telephone invalide."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if User.objects.filter(username=normalized_username).exists():
            return Response(
                {"detail": "Ce numero est deja associe a un compte. Connecte-toi."},
                status=status.HTTP_409_CONFLICT,
            )

        normalized_phone = requested_phone or normalized_username
        otp_code = _generate_otp()
        challenge = OtpChallenge.objects.create(
            user=None,
            purpose=purpose,
            pending_username=normalized_username,
            pending_phone=normalized_phone,
            pending_pin=password_or_pin,
            pending_first_name=requested_first_name,
            pending_last_name=requested_last_name,
            pending_email=requested_email,
            code_hash="pending",
            expires_at=timezone.now() + timedelta(seconds=OTP_TTL_SECONDS),
        )
        challenge.code_hash = _hash_otp(str(challenge.id), otp_code)
        challenge.save(update_fields=["code_hash"])
        _send_sms(normalized_phone, otp_code)
        return Response(
            {
                "challenge_id": str(challenge.id),
                "phone_hint": _mask_phone(normalized_phone),
                "expires_in": OTP_TTL_SECONDS,
                "message": "OTP envoye par SMS.",
            },
            status=status.HTTP_200_OK,
        )

    user = None
    for candidate in _username_candidates(username_input):
        user = authenticate(username=candidate, password=password_or_pin)
        if user:
            break

    # Fallback for PIN-based login flows where app sends PIN but account password differs.
    if not user:
        for candidate in _username_candidates(username_input):
            try:
                candidate_user = User.objects.get(username=candidate)
            except User.DoesNotExist:
                continue
            if getattr(candidate_user, "code_pin", "") == password_or_pin:
                user = candidate_user
                break

    if not user:
        return Response(
            {"detail": "Identifiants invalides (numero/username ou PIN)."},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    normalized_phone = _normalize_phone(getattr(user, "numero_telephone", ""))
    if not normalized_phone:
        return Response(
            {"detail": "Aucun numero de telephone lie a ce compte."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    otp_code = _generate_otp()
    challenge = OtpChallenge.objects.create(
        user=user,
        purpose=purpose,
        code_hash="pending",
        expires_at=timezone.now() + timedelta(seconds=OTP_TTL_SECONDS),
    )
    challenge.code_hash = _hash_otp(str(challenge.id), otp_code)
    challenge.save(update_fields=["code_hash"])

    _send_sms(normalized_phone, otp_code)

    return Response(
        {
            "challenge_id": str(challenge.id),
            "phone_hint": _mask_phone(normalized_phone),
            "expires_in": OTP_TTL_SECONDS,
            "message": "OTP envoye par SMS.",
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def resend_otp(request):
    challenge_id = request.data.get("challenge_id")
    if not challenge_id:
        return Response({"detail": "challenge_id requis."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        challenge = OtpChallenge.objects.select_related("user").get(id=challenge_id)
    except OtpChallenge.DoesNotExist:
        return Response({"detail": "Challenge introuvable."}, status=status.HTTP_404_NOT_FOUND)

    if challenge.is_used:
        return Response({"detail": "Challenge deja utilise."}, status=status.HTTP_400_BAD_REQUEST)

    normalized_phone = _normalize_phone(getattr(challenge.user, "numero_telephone", ""))
    if not normalized_phone:
        normalized_phone = _normalize_phone(getattr(challenge, "pending_phone", ""))
    if not normalized_phone:
        return Response({"detail": "Numero de telephone indisponible."}, status=status.HTTP_400_BAD_REQUEST)

    otp_code = _generate_otp()
    challenge.code_hash = _hash_otp(str(challenge.id), otp_code)
    challenge.expires_at = timezone.now() + timedelta(seconds=OTP_TTL_SECONDS)
    challenge.attempts = 0
    challenge.save(update_fields=["code_hash", "expires_at", "attempts", "updated_at"])

    _send_sms(normalized_phone, otp_code)
    return Response(
        {
            "challenge_id": str(challenge.id),
            "phone_hint": _mask_phone(normalized_phone),
            "expires_in": OTP_TTL_SECONDS,
            "message": "Nouveau OTP envoye.",
        },
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
def verify_otp(request):
    serializer = VerifyOtpSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    challenge_id = serializer.validated_data["challenge_id"]
    otp_code = serializer.validated_data["otp"]

    try:
        challenge = OtpChallenge.objects.select_related("user").get(id=challenge_id)
    except OtpChallenge.DoesNotExist:
        return Response({"detail": "Challenge introuvable."}, status=status.HTTP_404_NOT_FOUND)

    if challenge.is_used:
        return Response({"detail": "OTP deja utilise."}, status=status.HTTP_400_BAD_REQUEST)

    if challenge.expires_at < timezone.now():
        return Response({"detail": "OTP expire."}, status=status.HTTP_400_BAD_REQUEST)

    if challenge.attempts >= OTP_MAX_ATTEMPTS:
        return Response({"detail": "Trop de tentatives."}, status=status.HTTP_429_TOO_MANY_REQUESTS)

    if challenge.code_hash != _hash_otp(str(challenge.id), otp_code):
        challenge.attempts = challenge.attempts + 1
        challenge.save(update_fields=["attempts", "updated_at"])
        return Response({"detail": "OTP invalide."}, status=status.HTTP_400_BAD_REQUEST)

    user = challenge.user
    if challenge.purpose == OtpChallenge.PURPOSE_REGISTER:
        pending_username = (challenge.pending_username or "").strip()
        pending_phone = _normalize_phone(challenge.pending_phone or "")
        pending_pin = (challenge.pending_pin or "").strip()

        if not pending_username or not pending_pin:
            return Response(
                {"detail": "Donnees d'inscription OTP invalides."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if User.objects.filter(username=pending_username).exists():
            return Response(
                {"detail": "Ce compte existe deja. Connecte-toi."},
                status=status.HTTP_409_CONFLICT,
            )

        user = User(
            username=pending_username,
            numero_telephone=pending_phone or pending_username,
            code_pin=pending_pin,
            first_name=challenge.pending_first_name,
            last_name=challenge.pending_last_name,
            email=challenge.pending_email,
        )
        user.set_password(pending_pin)
        user.save()
        challenge.user = user

    if not user:
        return Response(
            {"detail": "Utilisateur introuvable pour ce challenge."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    wallet, _ = Wallet.objects.get_or_create(user=user)

    challenge.is_used = True
    challenge.save(update_fields=["is_used", "updated_at", "user"])

    refresh = RefreshToken.for_user(user)
    return Response(
        {
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email or "",
                "first_name": user.first_name or "",
                "last_name": user.last_name or "",
                "date_joined": user.date_joined,
                "numero_telephone": user.numero_telephone,
                "solde_courant": wallet.solde_courant,
            },
        },
        status=status.HTTP_200_OK,
    )


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    user = request.user
    wallet, _ = Wallet.objects.get_or_create(user=user)
    return Response({
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "first_name": user.first_name or "",
        "last_name": user.last_name or "",
        "date_joined": user.date_joined,
        "numero_telephone": user.numero_telephone,
        "solde_courant": wallet.solde_courant,
    })