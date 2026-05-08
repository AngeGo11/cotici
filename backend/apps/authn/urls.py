from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from .views import health, register, me, request_otp, verify_otp, resend_otp

urlpatterns = [
    path("health/", health, name="authn-health"),
    path("register/", register, name="authn-register"),
    path("login/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("request-otp/", request_otp, name="authn-request-otp"),
    path("verify-otp/", verify_otp, name="authn-verify-otp"),
    path("resend-otp/", resend_otp, name="authn-resend-otp"),
    path("refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("me/", me, name="authn-me"),
]