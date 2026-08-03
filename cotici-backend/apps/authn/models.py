from django.contrib.auth.hashers import check_password, make_password
from django.contrib.auth.models import AbstractUser
from django.db import models
import uuid

# Create your models here.


class User(AbstractUser):
    # Stores a Django password hash (via set_code_pin), never the raw PIN.
    code_pin = models.CharField(max_length=128)
    numero_telephone = models.CharField(max_length=15, unique=True)

    def set_code_pin(self, raw_pin: str) -> None:
        self.code_pin = make_password(raw_pin)

    def check_code_pin(self, raw_pin: str) -> bool:
        if not self.code_pin:
            return False
        return check_password(raw_pin, self.code_pin)


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


class PinResetToken(models.Model):
    """Jeton court, à usage unique, permettant de réinitialiser le
    `code_pin` d'un utilisateur après vérification OTP (purpose=reset_pin).

    Le jeton en clair (`secrets.token_urlsafe`) n'est JAMAIS stocké : seul
    son hash SHA-256 (`token_hash`) l'est, exactement comme `code_hash` sur
    `OtpChallenge`. Sa consommation doit être atomique (`select_for_update`
    côté vue) pour empêcher qu'un double appel concurrent ne change le PIN
    deux fois.
    """

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="pin_reset_tokens",
    )
    token_hash = models.CharField(max_length=128, unique=True)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ("-created_at",)


