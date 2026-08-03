"""Serializers de l'écran `/api/admin/wallets/` (consultation + ajustement)."""
from __future__ import annotations

from rest_framework import serializers

from apps.wallet.models import Transaction, Wallet
from apps.administration.api.serializers.pii import MaskedPhoneField


class WalletTransactionSerializer(serializers.ModelSerializer):
    """Ligne de l'historique de transactions affiché dans la fiche wallet."""

    class Meta:
        model = Transaction
        fields = [
            "id",
            "ref_transaction",
            "type_transaction",
            "mode_de_paiement",
            "montant_transaction",
            "solde_courant",
            "statut_transaction",
            "date_transaction",
        ]
        read_only_fields = fields


class WalletListSerializer(serializers.ModelSerializer):
    """Ligne de la liste des portefeuilles : titulaire, solde, ancienneté du
    compte et nombre de transactions (précalculé par `annotate` côté
    service, jamais recompté ici pour éviter un N+1)."""

    username = serializers.CharField(source="user.username", read_only=True)
    numero_telephone_masque = MaskedPhoneField(source="user.numero_telephone")
    full_name = serializers.SerializerMethodField()
    transactions_count = serializers.IntegerField(read_only=True)
    # NB : `Wallet` n'a pas de champ `created_at` propre (voir apps.wallet.models) ;
    # on utilise `user.date_joined` comme proxy documenté de la date de création
    # du portefeuille, un `Wallet` étant créé au plus tôt à la création du compte.
    created_at = serializers.DateTimeField(source="user.date_joined", read_only=True)

    class Meta:
        model = Wallet
        fields = [
            "id",
            "username",
            "numero_telephone_masque",
            "full_name",
            "solde_courant",
            "transactions_count",
            "created_at",
        ]
        read_only_fields = fields

    def get_full_name(self, obj: Wallet) -> str:
        user = obj.user
        full = f"{(user.first_name or '').strip()} {(user.last_name or '').strip()}".strip()
        return full or user.username


class WalletDetailSerializer(WalletListSerializer):
    """Fiche détail : mêmes champs que la liste, enrichis des dernières
    transactions du wallet (les 20 plus récentes, les plus anciennes n'étant
    pas pertinentes pour une vue de support/audit ponctuelle)."""

    recent_transactions = serializers.SerializerMethodField()

    class Meta(WalletListSerializer.Meta):
        fields = WalletListSerializer.Meta.fields + ["recent_transactions"]
        read_only_fields = fields

    def get_recent_transactions(self, obj: Wallet) -> list[dict]:
        transactions = obj.transaction_set.order_by("-date_transaction")[:20]
        return WalletTransactionSerializer(transactions, many=True).data


class WalletAdjustSerializer(serializers.Serializer):
    """Corps de `POST /api/admin/wallets/{id}/adjust/`.

    `amount` est un delta signé (positif = crédit, négatif = débit),
    exprimé sans décimales pour rester cohérent avec `Wallet.solde_courant`
    (`DecimalField(max_digits=10, decimal_places=0)`).
    """

    amount = serializers.DecimalField(max_digits=10, decimal_places=0)
    reason = serializers.CharField(
        allow_blank=False, help_text="Motif obligatoire (action sensible)."
    )

    def validate_amount(self, value):
        if value == 0:
            raise serializers.ValidationError(
                "Le montant de l'ajustement ne peut pas être nul."
            )
        return value
