from django.contrib.auth import get_user_model
from rest_framework import serializers

User = get_user_model()

class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, min_length=4)
    username = serializers.CharField(required=False, allow_blank=True)

    class Meta:
        model = User
        fields = ("id", "username", "password", "email", "numero_telephone", "code_pin")
        read_only_fields = ("id",)

    def _normalize_phone(self, value):
        return "".join(ch for ch in (value or "") if ch.isdigit())

    def create(self, validated_data):
        password = validated_data.pop("password")
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
        user.save()
        return user


class RequestOtpSerializer(serializers.Serializer):
    username = serializers.CharField()
    password = serializers.CharField(write_only=True, min_length=4, max_length=128)
    purpose = serializers.ChoiceField(
        choices=("login", "register", "reset_pin"), default="login", required=False
    )
    numero_telephone = serializers.CharField(required=False, allow_blank=True)
    first_name = serializers.CharField(required=False, allow_blank=True)
    last_name = serializers.CharField(required=False, allow_blank=True)
    email = serializers.EmailField(required=False, allow_blank=True)


class VerifyOtpSerializer(serializers.Serializer):
    challenge_id = serializers.UUIDField()
    otp = serializers.CharField(min_length=4, max_length=4)