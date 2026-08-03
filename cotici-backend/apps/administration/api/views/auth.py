"""Vues du flux d'authentification back-office (`/api/admin/auth/`).

Toutes ces vues sont volontairement "thin" : la logique vit dans
`services/auth_service.py`.
"""
from __future__ import annotations

from django.conf import settings
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import ensure_csrf_cookie
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.administration.api.serializers.auth import (
    AdminLoginSerializer,
    AdminLogoutSerializer,
    AdminTotpVerifySerializer,
)
from apps.administration.api.serializers.me import AdminMeSerializer
from apps.administration.authentication import AdminSessionAuthentication
from apps.administration.domain.errors import (
    InvalidCredentialsError,
    InvalidTotpCodeError,
    PreAuthExpiredError,
    ReplayedTotpCodeError,
    StaffProfileInactiveError,
    TotpAlreadyConfirmedError,
    TotpNotConfiguredError,
)
from apps.administration.permissions import IsStaffMember
from apps.administration.services import auth_service
from apps.administration.throttling import AdminLoginByAccountThrottle, AdminLoginThrottle


def _set_preauth_cookie(response: Response, token: str, ttl: int) -> None:
    response.set_cookie(
        auth_service.PREAUTH_COOKIE_NAME,
        token,
        max_age=ttl,
        httponly=True,
        secure=not settings.DEBUG,
        samesite="Strict",
        path="/api/admin/auth/",
    )


def _delete_preauth_cookie(response: Response) -> None:
    response.delete_cookie(auth_service.PREAUTH_COOKIE_NAME, path="/api/admin/auth/")


class AdminCsrfView(APIView):
    """`GET /api/admin/auth/csrf/` : initialise le cookie CSRF admin.

    À appeler avant tout `POST` (login inclus) : le client doit lire ce
    cookie et renvoyer sa valeur dans l'en-tête `X-CSRFToken`.
    """

    authentication_classes: list = []
    permission_classes = [AllowAny]

    @method_decorator(ensure_csrf_cookie)
    def get(self, request):
        return Response({"detail": "Cookie CSRF initialisé."})


class AdminLoginView(APIView):
    """`POST /api/admin/auth/login/` : étape 1 (identifiant + mot de passe).

    Ne connecte PAS la session : retourne un état de pré-authentification
    (cookie signé, TTL court) nécessaire pour appeler `/totp/setup/` ou
    `/totp/verify/`.
    """

    authentication_classes: list = []
    permission_classes = [AllowAny]
    throttle_classes = [AdminLoginThrottle, AdminLoginByAccountThrottle]
    throttle_scope = "admin_login"

    def post(self, request):
        serializer = AdminLoginSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = auth_service.start_login(
                request,
                serializer.validated_data["identifiant"],
                serializer.validated_data["password"],
            )
        except InvalidCredentialsError:
            return Response(
                {"detail": "Identifiants invalides."}, status=status.HTTP_401_UNAUTHORIZED
            )

        # Sans second facteur (ADMIN_TOTP_REQUIRED=False), la session est déjà
        # ouverte : on renvoie directement le profil, sans cookie de pré-auth.
        if result.get("session_established"):
            profile = request.user.staff_profile
            payload = AdminMeSerializer(profile).data
            payload["session_established"] = True
            payload["totp_setup_required"] = False
            return Response(payload, status=status.HTTP_200_OK)

        response = Response(
            {
                "totp_setup_required": result["totp_setup_required"],
                "session_established": False,
            },
            status=status.HTTP_200_OK,
        )
        _set_preauth_cookie(response, result["preauth_token"], result["preauth_ttl"])
        return response


class AdminTotpSetupView(APIView):
    """`POST /api/admin/auth/totp/setup/` : génère le secret TOTP (premier
    login uniquement). Nécessite un cookie de pré-authentification valide."""

    authentication_classes: list = []
    permission_classes = [AllowAny]
    throttle_classes = [AdminLoginThrottle]
    throttle_scope = "admin_login"

    def post(self, request):
        try:
            result = auth_service.setup_totp(request)
        except PreAuthExpiredError:
            return Response(
                {"detail": "Session de connexion expirée : recommencez depuis /login/."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        except StaffProfileInactiveError:
            return Response({"detail": "Profil staff inactif."}, status=status.HTTP_403_FORBIDDEN)
        except TotpAlreadyConfirmedError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)

        return Response(result, status=status.HTTP_200_OK)


class AdminTotpVerifyView(APIView):
    """`POST /api/admin/auth/totp/verify/` : valide le code TOTP et établit
    la session administrateur."""

    authentication_classes: list = []
    permission_classes = [AllowAny]
    throttle_classes = [AdminLoginThrottle]
    throttle_scope = "admin_login"

    def post(self, request):
        serializer = AdminTotpVerifySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            profile = auth_service.verify_totp(request, serializer.validated_data["code"])
        except PreAuthExpiredError:
            return Response(
                {"detail": "Session de connexion expirée : recommencez depuis /login/."},
                status=status.HTTP_401_UNAUTHORIZED,
            )
        except StaffProfileInactiveError:
            return Response({"detail": "Profil staff inactif."}, status=status.HTTP_403_FORBIDDEN)
        except TotpNotConfiguredError as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except (InvalidTotpCodeError, ReplayedTotpCodeError) as exc:
            return Response({"detail": str(exc)}, status=status.HTTP_401_UNAUTHORIZED)

        response = Response(AdminMeSerializer(profile).data, status=status.HTTP_200_OK)
        _delete_preauth_cookie(response)
        return response


class AdminLogoutView(APIView):
    """`POST /api/admin/auth/logout/` : termine la session courante (ou
    toutes les sessions actives si `everywhere=true`)."""

    authentication_classes = [AdminSessionAuthentication]
    permission_classes = [IsAuthenticated, IsStaffMember]

    def post(self, request):
        serializer = AdminLogoutSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        auth_service.logout(request, everywhere=serializer.validated_data["everywhere"])
        return Response({"detail": "Déconnecté."}, status=status.HTTP_200_OK)
