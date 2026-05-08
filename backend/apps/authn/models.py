from django.contrib.auth.models import AbstractUser
from django.db import models
import uuid

# Create your models here.


class User(AbstractUser):
    code_pin = models.CharField(max_length=4)
    numero_telephone = models.CharField(max_length=15)


class OtpChallenge(models.Model):
    PURPOSE_LOGIN = "login"
    PURPOSE_REGISTER = "register"
    PURPOSE_RESET_PIN = "reset_pin"
    PURPOSE_CHOICES = (
        (PURPOSE_LOGIN, "Login"),
        (PURPOSE_REGISTER, "Register"),
        (PURPOSE_RESET_PIN, "Reset PIN"),
    )

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="otp_challenges",
        null=True,
        blank=True,
    )
    purpose = models.CharField(max_length=20, choices=PURPOSE_CHOICES, default=PURPOSE_LOGIN)
    pending_username = models.CharField(max_length=150, blank=True, default="")
    pending_phone = models.CharField(max_length=15, blank=True, default="")
    pending_pin = models.CharField(max_length=4, blank=True, default="")
    pending_first_name = models.CharField(max_length=150, blank=True, default="")
    pending_last_name = models.CharField(max_length=150, blank=True, default="")
    pending_email = models.EmailField(blank=True, default="")
    code_hash = models.CharField(max_length=128)
    expires_at = models.DateTimeField()
    attempts = models.PositiveSmallIntegerField(default=0)
    is_used = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ("-created_at",)


