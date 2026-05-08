from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.wallet.models import Wallet

User = get_user_model()


class WalletSerializer(serializers.ModelSerializer):
    class Meta:
        model = Wallet
        fields = ("id", "solde_courant", "user")
        read_only_fields = ("id",)

    def create(self, validated_data):
        return Wallet.objects.create(**validated_data)
