from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.tontine.models import Tontine

User = get_user_model()


class TontineSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tontine
        fields = ("id", "hote", "type_tontine", "est_active", "date_creation", "description")
        read_only_fields = ("id",)

    def create(self, validated_data):
        return Tontine.objects.create(**validated_data)
