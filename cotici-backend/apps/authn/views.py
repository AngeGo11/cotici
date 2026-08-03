from datetime import timedelta
import hashlib
import logging
import secrets

from django.contrib.auth import authenticate
from django.contrib.auth import get_user_model
from django.db import transaction
from django.http import JsonResponse
from django.utils import timezone
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle, SimpleRateThrottle
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView

from .models import OtpChallenge, PinResetToken
from .serializers import (
    RegisterSerializer,
    RequestOtpSerializer,
    ResendOtpSerializer,
    ResetPinSerializer,
    VerifyOtpSerializer,
)
from .sms import SmsError, mask_phone, send_sms
from apps.audits.models import AuditLog
from apps.notifications.domain.catalog import spec_securite_connexion
from apps.notifications.services.notification_service import NotificationService
from apps.wallet.models import Wallet
from apps.wallet.services.user_payload import build_user_wallet_payload
from ..savings.models import EpargnePersonnelle
from ..tontine.models import Tontine, TontineMembre

logger = logging.getLogger(__name__)
OTP_LENGTH = 4
OTP_TTL_SECONDS = 300
OTP_MAX_ATTEMPTS = 5
# Durée de vie du `reset_token` émis par verify_otp (purpose=reset_pin) :
# jeton court et à usage unique, consommé par /reset-pin/.
RESET_TOKEN_TTL_SECONDS = 300
User = get_user_model()


def _normalize_phone(value):
    return "".join(ch for ch in (value or "") if ch.isdigit())


def _client_ip(request) -> str:
    """Meilleure estimation de l'IP cliente, en tenant compte d'un éventuel proxy."""
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR", "") or ""


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


# Réutilise le masquage de numéro du module SMS (une seule implémentation).
_mask_phone = mask_phone

# Message renvoyé au client mobile quand l'envoi du SMS OTP échoue côté
# provider : générique à dessein (jamais de détail technique/provider exposé
# à l'utilisateur final).
SMS_FAILURE_DETAIL = "Impossible d'envoyer le code de vérification. Réessayez dans quelques instants."


def _generate_otp():
    return f"{secrets.randbelow(10 ** OTP_LENGTH):0{OTP_LENGTH}d}"


def _otp_message(otp_code):
    return f"Votre code COTICI est {otp_code}. Il expire dans 5 minutes."


# Message envoyé au PROPRIETAIRE REEL d'un numéro déjà inscrit lorsqu'une
# inscription (purpose=register) est tentée sur son numéro. Il ne contient
# aucun OTP exploitable : seul lui le reçoit (l'appelant de request_otp n'a,
# par définition, pas accès au téléphone d'autrui), ce qui referme le canal
# d'énumération de comptes tout en informant la vraie victime d'une
# éventuelle tentative.
def _existing_account_sms_message():
    return "Tu as deja un compte COTICI. Connecte-toi plutot que de re-creer un compte."


# Réponse HTTP générique et STABLE (même `detail`/`message`, mêmes clés) que
# le numéro visé par une inscription soit déjà utilisé ou non — c'est ce qui
# empêche un tiers non authentifié de déduire l'existence d'un compte à
# partir de la réponse de /request-otp/ (purpose=register).
REGISTER_OTP_GENERIC_MESSAGE = "Si ce numero est eligible, un code a ete envoye par SMS."


class PhoneRateThrottle(SimpleRateThrottle):
    """Throttle keyée sur le NUMERO CIBLE (`username`/`numero_telephone`
    envoyé dans le corps de la requête), en complément du throttle par IP
    (`ScopedRateThrottle`).

    Sans cette clé additionnelle, un attaquant distribué sur plusieurs IP
    pourrait bombarder un même numéro de SMS OTP en contournant la limite
    "par IP" — chaque IP disposant de son propre quota. Cette throttle,
    elle, épuise un quota PARTAGÉ pour un numéro donné quelle que soit l'IP
    d'origine.
    """

    scope = "otp_request_phone"

    def get_cache_key(self, request, view):
        phone = _normalize_phone(
            request.data.get("username") or request.data.get("numero_telephone") or ""
        )
        if not phone:
            # Pas de numéro exploitable dans la requête : le serializer
            # rejettera de toute façon la requête plus loin (400), et le
            # throttle par IP (ScopedRateThrottle) reste actif.
            return None
        return self.cache_format % {"scope": self.scope, "ident": phone}


def _send_otp_sms(phone, otp_code):
    """Envoie le SMS contenant le code OTP.

    Ne fait AUCUNE hypothèse de succès : lève `SmsError` (propagée depuis
    `apps.authn.sms.send_sms`) si l'envoi échoue, pour que l'appelant puisse
    répondre une erreur HTTP explicite plutôt que de prétendre que l'OTP est
    parti. Ne logge jamais le code en clair ici (délégué à `send_sms`, dont
    seul le mode "console" logge le contenu, en dev).
    """
    send_sms(phone, _otp_message(otp_code))


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
        etat=EpargnePersonnelle.ETAT.ACTIF,
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
@throttle_classes([ScopedRateThrottle, PhoneRateThrottle])
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

        # SECURITE (fermeture d'énumération de comptes) : on ne renvoie
        # JAMAIS un statut/une réponse différente selon que ce numéro est
        # déjà inscrit ou non. Un OtpChallenge est TOUJOURS créé et un SMS
        # est TOUJOURS envoyé au numéro fourni — mais si le numéro
        # correspond à un compte existant, le SMS envoyé au titulaire réel
        # NE CONTIENT PAS l'OTP (juste une notification "tu as déjà un
        # compte") : personne d'autre que ce titulaire ne peut donc jamais
        # obtenir le code, ce qui rend ce challenge non exploitable pour
        # verify_otp par un tiers. Voir aussi le second contrôle
        # d'existence dans verify_otp (purpose=register).
        existing_user = User.objects.filter(username=normalized_username).first()

        normalized_phone = requested_phone or normalized_username
        otp_code = _generate_otp()
        # L'instance n'est PAS encore persistée : `id` (UUIDField à default
        # uuid4) est déjà disponible pour hasher l'OTP, mais on ne fait
        # `.save()` qu'après confirmation de l'envoi SMS. Ainsi, si l'envoi
        # échoue, aucun OtpChallenge orphelin ne reste en base (pas de code
        # jamais reçu par l'utilisateur mais tout de même vérifiable).
        challenge = OtpChallenge(
            user=None,
            purpose=purpose,
            pending_username=normalized_username,
            pending_phone=normalized_phone,
            # Si le numéro est déjà pris, ces données d'inscription en
            # attente ne doivent jamais pouvoir servir à créer un compte
            # (verify_otp re-vérifie de toute façon l'unicité) : on les
            # laisse simplement vides plutôt que de stocker un PIN candidat
            # inutile.
            pending_pin=("" if existing_user else password_or_pin),
            pending_first_name=("" if existing_user else requested_first_name),
            pending_last_name=("" if existing_user else requested_last_name),
            pending_email=("" if existing_user else requested_email),
            expires_at=timezone.now() + timedelta(seconds=OTP_TTL_SECONDS),
        )
        challenge.code_hash = _hash_otp(str(challenge.id), otp_code)

        sms_text = _existing_account_sms_message() if existing_user else _otp_message(otp_code)

        try:
            send_sms(normalized_phone, sms_text)
        except SmsError as exc:
            logger.error(
                "Échec envoi OTP (register) phone=%s: %s", _mask_phone(normalized_phone), exc
            )
            return Response(
                {"detail": SMS_FAILURE_DETAIL}, status=status.HTTP_503_SERVICE_UNAVAILABLE
            )

        challenge.save()
        return Response(
            {
                "challenge_id": str(challenge.id),
                "phone_hint": _mask_phone(normalized_phone),
                "expires_in": OTP_TTL_SECONDS,
                "message": REGISTER_OTP_GENERIC_MESSAGE,
            },
            status=status.HTTP_200_OK,
        )

    user = None
    for candidate in _username_candidates(username_input):
        user = authenticate(username=candidate, password=password_or_pin)
        if user:
            break

    # Fallback for PIN-based login flows where app sends PIN but account password differs.
    # SECURITE : contrairement à `authenticate()` (qui rejette un compte
    # `is_active=False` via ModelBackend.user_can_authenticate), une requête
    # ORM brute ne fait AUCUNE vérification d'activation — sans le filtre
    # `is_active=True` ci-dessous, un compte désactivé/banni pouvait
    # continuer à demander un OTP et se connecter via son PIN.
    if not user:
        for candidate in _username_candidates(username_input):
            try:
                candidate_user = User.objects.get(username=candidate, is_active=True)
            except User.DoesNotExist:
                continue
            if candidate_user.check_code_pin(password_or_pin):
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
    # Même logique que pour l'inscription : on ne persiste le challenge
    # qu'après confirmation de l'envoi SMS (voir commentaire ci-dessus).
    challenge = OtpChallenge(
        user=user,
        purpose=purpose,
        expires_at=timezone.now() + timedelta(seconds=OTP_TTL_SECONDS),
    )
    challenge.code_hash = _hash_otp(str(challenge.id), otp_code)

    try:
        _send_otp_sms(normalized_phone, otp_code)
    except SmsError as exc:
        logger.error("Échec envoi OTP (login) phone=%s: %s", _mask_phone(normalized_phone), exc)
        return Response({"detail": SMS_FAILURE_DETAIL}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    challenge.save()

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
@throttle_classes([ScopedRateThrottle])
def resend_otp(request):
    serializer = ResendOtpSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    challenge_id = serializer.validated_data["challenge_id"]

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
    new_code_hash = _hash_otp(str(challenge.id), otp_code)
    new_expires_at = timezone.now() + timedelta(seconds=OTP_TTL_SECONDS)

    # Contrairement à la création (register/login), ce challenge existe déjà
    # et peut porter un code encore valide. On calcule le nouveau code et on
    # tente l'envoi AVANT de toucher à la ligne en base : si l'envoi échoue,
    # on ne modifie rien (ni code_hash, ni expiration, ni attempts), pour ne
    # pas invalider silencieusement un OTP précédent que l'utilisateur aurait
    # potentiellement déjà reçu.
    try:
        _send_otp_sms(normalized_phone, otp_code)
    except SmsError as exc:
        logger.error("Échec envoi OTP (resend) phone=%s: %s", _mask_phone(normalized_phone), exc)
        return Response({"detail": SMS_FAILURE_DETAIL}, status=status.HTTP_503_SERVICE_UNAVAILABLE)

    challenge.code_hash = new_code_hash
    challenge.expires_at = new_expires_at
    challenge.attempts = 0
    challenge.save(update_fields=["code_hash", "expires_at", "attempts", "updated_at"])

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
@throttle_classes([ScopedRateThrottle])
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

        # SECURITE (fermeture d'énumération de comptes) : "données
        # d'inscription invalides" et "ce compte existe déjà" renvoient
        # EXACTEMENT la même réponse générique que "OTP invalide" — voir le
        # commentaire symétrique dans request_otp. `pending_pin` a été vidé
        # côté request_otp si le numéro était déjà pris au moment de la
        # requête ; on revérifie aussi ici l'unicité pour couvrir le cas
        # (rare) où le compte aurait été créé entre-temps.
        if (
            not pending_username
            or not pending_pin
            or User.objects.filter(username=pending_username).exists()
        ):
            return Response({"detail": "OTP invalide."}, status=status.HTTP_400_BAD_REQUEST)

        user = User(
            username=pending_username,
            numero_telephone=pending_phone or pending_username,
            first_name=challenge.pending_first_name,
            last_name=challenge.pending_last_name,
            email=challenge.pending_email,
        )
        user.set_password(pending_pin)
        user.set_code_pin(pending_pin)
        user.save()
        challenge.user = user
        # Le PIN en clair n'a plus lieu d'exister une fois hashé sur le User —
        # purge immédiate pour ne pas laisser de secret en clair en base.
        challenge.pending_pin = ""

    if not user:
        return Response(
            {"detail": "Utilisateur introuvable pour ce challenge."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if challenge.purpose == OtpChallenge.PURPOSE_RESET_PIN:
        # Flux "jeton court à usage unique" : on ne connecte JAMAIS
        # l'utilisateur ici (pas de JWT émis) — on renvoie uniquement un
        # `reset_token` opaque, à courte durée de vie, à usage unique, que
        # /reset-pin/ devra présenter pour effectivement changer le PIN.
        raw_reset_token = secrets.token_urlsafe(32)
        # Entropie déjà suffisante (256 bits) : contrairement à l'OTP à 4
        # chiffres, aucun besoin de lier le hash à l'identifiant de
        # l'enregistrement pour le rendre non-devinable.
        token_hash = hashlib.sha256(raw_reset_token.encode("utf-8")).hexdigest()
        PinResetToken.objects.create(
            user=user,
            token_hash=token_hash,
            expires_at=timezone.now() + timedelta(seconds=RESET_TOKEN_TTL_SECONDS),
        )
        challenge.is_used = True
        challenge.save(update_fields=["is_used", "updated_at"])
        return Response(
            {"reset_token": raw_reset_token, "expires_in": RESET_TOKEN_TTL_SECONDS},
            status=status.HTTP_200_OK,
        )

    Wallet.objects.get_or_create(user=user)

    challenge.is_used = True
    challenge.save(update_fields=["is_used", "updated_at", "user", "pending_pin"])

    # Alerte de sécurité uniquement pour une connexion (pas une inscription : le
    # compte vient d'être créé, une "nouvelle connexion" n'aurait aucun sens).
    if challenge.purpose == OtpChallenge.PURPOSE_LOGIN:
        NotificationService.emit(
            destinataire=user,
            spec=spec_securite_connexion(ip=_client_ip(request), when=timezone.now()),
        )

    refresh = RefreshToken.for_user(user)
    return Response(
        {
            "access": str(refresh.access_token),
            "refresh": str(refresh),
            "user": build_user_wallet_payload(user),
        },
        status=status.HTTP_200_OK,
    )


def _display_name(user):
    """Nom d'affichage pour l'audit — pas de dépendance croisée vers
    apps.tontine (hors périmètre) : logique équivalente, en local."""
    name = f"{user.first_name or ''} {user.last_name or ''}".strip()
    return name or getattr(user, "numero_telephone", "") or user.username


def _revoke_all_tokens_for_user(user):
    """Révoque (blacklist) tous les refresh tokens JWT actuellement
    "outstanding" pour `user`.

    Repose sur `rest_framework_simplejwt.token_blacklist` : chaque appel à
    `RefreshToken.for_user(user)` (login OTP, ThrottledTokenObtainPairView)
    enregistre automatiquement un `OutstandingToken` dès lors que cette app
    est dans `INSTALLED_APPS`. Blacklister CES enregistrements empêche tout
    refresh ultérieur avec un token émis avant la réinitialisation du PIN —
    un attaquant qui aurait déjà volé un refresh token perd donc son accès
    dès que le PIN est changé. Les access tokens déjà émis restent valides
    jusqu'à leur expiration naturelle (courte, quelques minutes).
    """
    outstanding_ids = OutstandingToken.objects.filter(user=user).values_list("id", flat=True)
    BlacklistedToken.objects.bulk_create(
        (BlacklistedToken(token_id=token_id) for token_id in outstanding_ids),
        ignore_conflicts=True,
    )


@api_view(["POST"])
@permission_classes([AllowAny])
@throttle_classes([ScopedRateThrottle])
def reset_pin(request):
    """Étape finale du flux de réinitialisation de PIN : consomme un
    `reset_token` à usage unique (émis par verify_otp, purpose=reset_pin)
    pour appliquer un nouveau `code_pin`.

    Sécurité :
    - le jeton n'est jamais comparé/recherché en clair (hash SHA-256) ;
    - sa consommation est atomique (`select_for_update`) : deux appels
      concurrents avec le même jeton ne peuvent pas tous les deux réussir ;
    - expiration dure vérifiée côté serveur (5 minutes, cf verify_otp) ;
    - toutes les sessions JWT existantes de l'utilisateur sont révoquées
      après le changement de PIN ;
    - l'opération est journalisée dans AuditLog (action PIN_CHANGED).
    """
    serializer = ResetPinSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    raw_reset_token = serializer.validated_data["reset_token"]
    new_pin = serializer.validated_data["new_pin"]

    token_hash = hashlib.sha256(raw_reset_token.encode("utf-8")).hexdigest()

    with transaction.atomic():
        try:
            reset_entry = PinResetToken.objects.select_for_update().get(
                token_hash=token_hash, is_used=False
            )
        except PinResetToken.DoesNotExist:
            # Réponse générique volontaire : jeton inconnu, déjà consommé,
            # ou appartenant à un autre flux — aucune de ces distinctions
            # n'a besoin de fuiter vers l'appelant.
            return Response(
                {"detail": "Jeton de reinitialisation invalide ou expire."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if reset_entry.expires_at < timezone.now():
            return Response(
                {"detail": "Jeton de reinitialisation invalide ou expire."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Marqué consommé AVANT de relâcher le verrou (toujours dans la
        # même transaction) : un double appel concurrent avec le même
        # jeton verra le second `SELECT ... FOR UPDATE` soit bloqué puis
        # `is_used=True` (donc `DoesNotExist` sur le filtre ci-dessus une
        # fois la première transaction validée), soit carrément absent du
        # filtre s'il arrive après le commit.
        reset_entry.is_used = True
        reset_entry.save(update_fields=["is_used"])

        user = reset_entry.user
        user.set_code_pin(new_pin)
        user.save(update_fields=["code_pin"])

        _revoke_all_tokens_for_user(user)

        AuditLog.objects.create(
            user=user,
            user_display=_display_name(user),
            action=AuditLog.Action.PIN_CHANGED,
            resource="self-service:credential-reset",
            status=AuditLog.Status.SUCCESS,
            ip_address=_client_ip(request) or None,
        )

    return Response({"detail": "PIN reinitialise avec succes."}, status=status.HTTP_200_OK)


@api_view(["GET"])
@permission_classes([IsAuthenticated])
def me(request):
    return Response(build_user_wallet_payload(request.user))


class ThrottledTokenObtainPairView(TokenObtainPairView):
    """TokenObtainPairView expose un login direct username/password qui contourne
    entièrement le flux OTP throttlé (request_otp/verify_otp). Pour les comptes créés
    via l'inscription OTP, ce password EST le PIN à 4 chiffres (voir verify_otp) — sans
    throttle ici, cet endpoint est un chemin de bruteforce du PIN à lui seul."""

    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login_attempt"


# ScopedRateThrottle reads `throttle_scope` off the view class, which @api_view
# doesn't copy from the function automatically — set it explicitly here.
# Mitigates PIN brute-forcing (code_pin is a 4-digit space) and SMS-bombing via OTP spam.
request_otp.cls.throttle_scope = "otp_request"
resend_otp.cls.throttle_scope = "otp_request"
verify_otp.cls.throttle_scope = "otp_verify"
reset_pin.cls.throttle_scope = "pin_reset"