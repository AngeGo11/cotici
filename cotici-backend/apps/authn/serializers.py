from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers

User = get_user_model()

PIN_REGEX = r"^\d{4}$"


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=4, max_length=128)
    code_pin = serializers.RegexField(
        PIN_REGEX, write_only=True, error_messages={"invalid": "Le code PIN doit contenir exactement 4 chiffres."}
    )
    username = serializers.CharField(required=False, allow_blank=True, max_length=150)

    class Meta:
        model = User
        fields = ("id", "username", "password", "email", "numero_telephone", "code_pin")
        read_only_fields = ("id",)

    def _normalize_phone(self, value):
        return "".join(ch for ch in (value or "") if ch.isdigit())

    def validate_numero_telephone(self, value):
        normalized = self._normalize_phone(value)
        if normalized and not (8 <= len(normalized) <= 15):
            raise serializers.ValidationError("Numéro de téléphone invalide.")
        return value

    def validate_username(self, value):
        # `username` est redéclaré explicitement ci-dessus (pour le rendre
        # optionnel) : cela désactive la génération automatique du
        # `UniqueValidator` que ModelSerializer aurait ajoutée pour un champ
        # `unique=True` non redéclaré. Sans ce contrôle, un username en
        # doublon remontait tel quel jusqu'à `user.save()` et levait un
        # `IntegrityError` non rattrapé (500), au lieu d'un 400 propre.
        stripped = (value or "").strip()
        if stripped and User.objects.filter(username=stripped).exists():
            raise serializers.ValidationError("Ce nom d'utilisateur est déjà utilisé.")
        return value

    def validate_password(self, value):
        # `min_length=4` seul n'empêchait pas les mots de passe faibles
        # (ex: "1234", "password") : on applique ici les validateurs Django
        # standard (AUTH_PASSWORD_VALIDATORS). Ne s'applique QU'à ce champ
        # "password" (compte /register/, distinct du PIN 4 chiffres) — le
        # flux OTP (verify_otp) construit le User directement et n'appelle
        # jamais ce serializer, donc n'est pas affecté par ce durcissement.
        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages))
        return value

    def create(self, validated_data):
        password = validated_data.pop("password")
        raw_code_pin = validated_data.pop("code_pin")
        raw_phone = validated_data.get("numero_telephone", "")
        normalized_phone = self._normalize_phone(raw_phone)
        if normalized_phone:
            validated_data["numero_telephone"] = normalized_phone

        username = (validated_data.get("username") or "").strip()
        if not username:
            if not normalized_phone:
                raise serializers.ValidationError(
                    {"username": "username requis si numero_telephone absent."}
                )
            username = normalized_phone
            validated_data["username"] = username

        user = User(**validated_data)
        user.set_password(password)  # hash du mot de passe
        user.set_code_pin(raw_code_pin)  # hash du PIN, jamais stocké en clair
        user.save()
        return user


class RequestOtpSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True, min_length=4, max_length=128)
    purpose = serializers.ChoiceField(
        choices=("login", "register", "reset_pin"), default="login", required=False
    )
    numero_telephone = serializers.CharField(required=False, allow_blank=True, max_length=20)
    first_name = serializers.CharField(required=False, allow_blank=True, max_length=150)
    last_name = serializers.CharField(required=False, allow_blank=True, max_length=150)
    email = serializers.EmailField(required=False, allow_blank=True)

    def validate_numero_telephone(self, value):
        digits = "".join(ch for ch in (value or "") if ch.isdigit())
        if digits and not (8 <= len(digits) <= 15):
            raise serializers.ValidationError("Numéro de téléphone invalide.")
        return value


class ResendOtpSerializer(serializers.Serializer):
    challenge_id = serializers.UUIDField()


class VerifyOtpSerializer(serializers.Serializer):
    challenge_id = serializers.UUIDField()
    otp = serializers.RegexField(r"^\d{4}$", error_messages={"invalid": "OTP invalide."})


class ResetPinSerializer(serializers.Serializer):
    reset_token = serializers.CharField(min_length=1, max_length=256)
    # Réutilise exactement la même règle de validation que le PIN
    # d'inscription (`RegisterSerializer.code_pin`) : mêmes contraintes de
    # format partout dans le module, une seule source de vérité (PIN_REGEX).
    new_pin = serializers.RegexField(
        PIN_REGEX, error_messages={"invalid": "Le code PIN doit contenir exactement 4 chiffres."}
    )