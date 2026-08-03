"""Service d'authentification du back-office administrateur.

Flux de connexion en deux étapes :

1. `start_login` : vérifie identifiant + mot de passe. En cas de succès,
   émet un état de "pré-authentification" signé (cookie séparé de la
   session, TTL court `ADMIN_PREAUTH_TTL_SECONDS`) qui ne donne AUCUN accès
   au reste de l'API : il permet seulement d'appeler `setup_totp`/`verify_totp`.
2. `setup_totp` (premier login uniquement) puis `verify_totp` : établissent
   la session Django (avec rotation de clé anti-fixation) une fois le code
   TOTP validé.

`logout`/`logout_everywhere` terminent respectivement la session courante et
toutes les sessions actives de l'utilisateur.
"""
from __future__ import annotations

import pyotp
from django.conf import settings
from django.contrib.auth import login as django_login
from django.contrib.auth import logout as django_logout
from django.contrib.sessions.models import Session
from django.core import signing
from django.middleware.csrf import rotate_token
from django.utils import timezone

from apps.administration.domain.audit_actions import (
    ADMIN_LOGIN_FAILED,
    ADMIN_LOGIN_SUCCESS,
    ADMIN_LOGOUT,
    ADMIN_LOGOUT_ALL,
    ADMIN_TOTP_FAILED,
    ADMIN_TOTP_SETUP,
    ADMIN_TOTP_VERIFIED,
)
from apps.administration.domain.errors import (
    InvalidCredentialsError,
    InvalidTotpCodeError,
    PreAuthExpiredError,
    ReplayedTotpCodeError,
    StaffProfileInactiveError,
    TotpAlreadyConfirmedError,
    TotpNotConfiguredError,
)
from apps.administration.models import StaffLoginAttempt, StaffProfile
from apps.administration.repositories.staff_repository import (
    get_staff_profile_for_user,
    get_user_by_identifier,
    record_login_attempt,
)
from apps.audits.models import AdminActionLog
from apps.audits.services.admin_audit import record_admin_action

PREAUTH_COOKIE_NAME = "cotici_admin_preauth"
PREAUTH_SALT = "administration.preauth.v1"
SESSION_LAST_ACTIVITY_KEY = "_admin_last_activity_ts"


def _client_ip(request) -> str | None:
    return getattr(request, "admin_client_ip", None) or request.META.get("REMOTE_ADDR")


def _user_agent(request) -> str:
    return request.META.get("HTTP_USER_AGENT", "")


def _preauth_ttl() -> int:
    return int(getattr(settings, "ADMIN_PREAUTH_TTL_SECONDS", 300))


def _totp_required() -> bool:
    """Second facteur exigé ? Défaut `True` : l'absence de réglage ne doit
    jamais désactiver silencieusement la 2FA."""
    return bool(getattr(settings, "ADMIN_TOTP_REQUIRED", True))


def _establish_session(request, user) -> None:
    """Ouvre la session Django. `django_login` fait tourner la clé de session
    (protection anti-fixation) ; `rotate_token` régénère le jeton CSRF."""
    user.backend = "django.contrib.auth.backends.ModelBackend"
    django_login(request, user)
    rotate_token(request)
    request.session[SESSION_LAST_ACTIVITY_KEY] = timezone.now().timestamp()


def issue_preauth_token(user_id: int) -> str:
    """Signe un état de pré-authentification (TTL court, indépendant de la
    session Django) référençant uniquement l'utilisateur ayant réussi
    l'étape mot de passe."""
    return signing.dumps({"uid": user_id}, salt=PREAUTH_SALT)


def _read_preauth_user(request):
    token = request.COOKIES.get(PREAUTH_COOKIE_NAME)
    if not token:
        raise PreAuthExpiredError("Aucun état de pré-authentification.")
    try:
        data = signing.loads(token, salt=PREAUTH_SALT, max_age=_preauth_ttl())
    except signing.SignatureExpired as exc:
        raise PreAuthExpiredError("État de pré-authentification expiré.") from exc
    except signing.BadSignature as exc:
        raise PreAuthExpiredError("État de pré-authentification invalide.") from exc

    from django.contrib.auth import get_user_model

    User = get_user_model()
    user = User.objects.filter(pk=data.get("uid"), is_active=True).first()
    if user is None:
        raise PreAuthExpiredError("Utilisateur introuvable ou désactivé.")
    return user


def start_login(request, identifier: str, password: str) -> dict:
    """Étape 1 : vérifie identifiant + mot de passe.

    Retourne un dict `{"preauth_token", "totp_setup_required"}` en cas de
    succès ; lève `InvalidCredentialsError` sinon (message volontairement
    générique pour ne jamais révéler si l'identifiant existe).
    """
    ip = _client_ip(request)
    ua = _user_agent(request)
    user = get_user_by_identifier(identifier)
    profile = get_staff_profile_for_user(user) if user is not None else None

    password_ok = bool(user and user.is_active and user.check_password(password))
    profile_ok = bool(profile and profile.is_active)

    if not (password_ok and profile_ok):
        record_login_attempt(
            user=user,
            username_tried=identifier,
            ip_address=ip,
            user_agent=ua,
            stage=StaffLoginAttempt.Stage.PASSWORD,
            success=False,
        )
        if user is not None:
            record_admin_action(
                actor=user,
                action=ADMIN_LOGIN_FAILED,
                request=request,
                actor_role=getattr(profile, "role", ""),
                result=AdminActionLog.Result.FAILURE,
            )
        raise InvalidCredentialsError("Identifiants invalides.")

    record_login_attempt(
        user=user,
        username_tried=identifier,
        ip_address=ip,
        user_agent=ua,
        stage=StaffLoginAttempt.Stage.PASSWORD,
        success=True,
    )

    # Mode sans second facteur (`ADMIN_TOTP_REQUIRED=False`) : la session est
    # ouverte dès la validation du mot de passe. Aucun état de
    # pré-authentification n'est émis — il n'y a plus d'étape suivante.
    if not _totp_required():
        _establish_session(request, user)
        record_admin_action(
            actor=user,
            actor_role=profile.role,
            action=ADMIN_LOGIN_SUCCESS,
            request=request,
            result=AdminActionLog.Result.SUCCESS,
        )
        return {
            "preauth_token": None,
            "preauth_ttl": 0,
            "totp_setup_required": False,
            "session_established": True,
        }

    return {
        "preauth_token": issue_preauth_token(user.id),
        "preauth_ttl": _preauth_ttl(),
        "totp_setup_required": profile.totp_confirmed_at is None,
        "session_established": False,
    }


def setup_totp(request) -> dict:
    """Étape 2a (premier login uniquement) : génère un secret TOTP."""
    user = _read_preauth_user(request)
    profile = get_staff_profile_for_user(user)
    if profile is None or not profile.is_active:
        raise StaffProfileInactiveError()
    if profile.totp_confirmed_at is not None:
        raise TotpAlreadyConfirmedError("TOTP déjà configuré : utilisez /totp/verify/.")

    secret = pyotp.random_base32()
    profile.totp_secret = secret
    profile.save(update_fields=["totp_secret", "updated_at"])

    issuer = getattr(settings, "TOTP_ISSUER", "COTICI Admin")
    totp = pyotp.TOTP(secret)
    otpauth_url = totp.provisioning_uri(name=user.username, issuer_name=issuer)

    record_admin_action(
        actor=user,
        actor_role=profile.role,
        action=ADMIN_TOTP_SETUP,
        request=request,
        result=AdminActionLog.Result.SUCCESS,
    )

    return {"secret": secret, "otpauth_url": otpauth_url}


def _totp_counter_now() -> int:
    return int(timezone.now().timestamp() // 30)


def verify_totp(request, code: str):
    """Étape 2b : valide le code TOTP et établit la session administrateur.

    Anti-rejeu : le compteur de time-step (`last_totp_counter`) accepté est
    mémorisé ; tout code dont le compteur est <= au dernier accepté est
    refusé, même s'il est par ailleurs mathématiquement valide (fenêtre de
    tolérance `valid_window`).
    """
    user = _read_preauth_user(request)
    profile = get_staff_profile_for_user(user)
    if profile is None or not profile.is_active:
        raise StaffProfileInactiveError()
    if not profile.totp_secret:
        raise TotpNotConfiguredError("Aucun secret TOTP configuré : appelez /totp/setup/ d'abord.")

    totp = pyotp.TOTP(profile.totp_secret)
    ip = _client_ip(request)
    ua = _user_agent(request)

    if not totp.verify(code, valid_window=1):
        record_login_attempt(
            user=user, username_tried=user.username, ip_address=ip, user_agent=ua,
            stage=StaffLoginAttempt.Stage.TOTP, success=False,
        )
        record_admin_action(
            actor=user, actor_role=profile.role, action=ADMIN_TOTP_FAILED,
            request=request, result=AdminActionLog.Result.FAILURE,
        )
        raise InvalidTotpCodeError("Code TOTP invalide ou expiré.")

    current_counter = _totp_counter_now()
    if profile.last_totp_counter is not None and current_counter <= profile.last_totp_counter:
        record_login_attempt(
            user=user, username_tried=user.username, ip_address=ip, user_agent=ua,
            stage=StaffLoginAttempt.Stage.TOTP, success=False,
        )
        record_admin_action(
            actor=user, actor_role=profile.role, action=ADMIN_TOTP_FAILED,
            request=request, result=AdminActionLog.Result.FAILURE,
        )
        raise ReplayedTotpCodeError("Ce code TOTP a déjà été utilisé.")

    first_confirmation = profile.totp_confirmed_at is None
    now = timezone.now()
    profile.last_totp_counter = current_counter
    if first_confirmation:
        profile.totp_confirmed_at = now
    profile.last_login_ip = ip
    profile.save(
        update_fields=["last_totp_counter", "totp_confirmed_at", "last_login_ip", "updated_at"]
    )

    _establish_session(request, user)

    record_login_attempt(
        user=user, username_tried=user.username, ip_address=ip, user_agent=ua,
        stage=StaffLoginAttempt.Stage.TOTP, success=True,
    )
    record_admin_action(
        actor=user,
        actor_role=profile.role,
        action=ADMIN_TOTP_VERIFIED if not first_confirmation else ADMIN_LOGIN_SUCCESS,
        request=request,
        result=AdminActionLog.Result.SUCCESS,
    )

    return profile


def logout(request, *, everywhere: bool = False) -> None:
    """Termine la session courante (et, si `everywhere=True`, toutes les
    sessions actives de l'utilisateur)."""
    user = request.user
    if everywhere and getattr(user, "is_authenticated", False):
        _terminate_all_sessions(user)

    action = ADMIN_LOGOUT_ALL if everywhere else ADMIN_LOGOUT
    profile = get_staff_profile_for_user(user) if getattr(user, "is_authenticated", False) else None

    django_logout(request)

    if user is not None and getattr(user, "is_authenticated", False):
        record_admin_action(
            actor=user,
            actor_role=getattr(profile, "role", ""),
            action=action,
            request=request,
            result=AdminActionLog.Result.SUCCESS,
        )


def _terminate_all_sessions(user) -> None:
    """Supprime toutes les sessions Django actives associées à `user`."""
    for session in Session.objects.filter(expire_date__gte=timezone.now()).iterator():
        data = session.get_decoded()
        if str(data.get("_auth_user_id")) == str(user.pk):
            session.delete()
