from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.utils.utilitaires import _parse_amount, _resolve_payment_mode
from apps.wallet.models import Wallet

User = get_user_model()


class WalletSerializer(serializers.ModelSerializer):
    class Meta:
        model = Wallet
        fields = ("id", "solde_courant", "user")
        read_only_fields = ("id",)

    def create(self, validated_data):
        return Wallet.objects.create(**validated_data)


class DepositSerializer(serializers.Serializer):
    """Valide un dépôt. Réutilise _parse_amount/_resolve_payment_mode pour garder
    exactement le même comportement (tolérance de casse sur le mode, messages) que
    l'ancienne validation manuelle en vue."""

    montant_depose = serializers.CharField(required=False, allow_null=True)
    mode_de_paiement = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    # Clé d'idempotence optionnelle (UUID côté client) : permet de rejouer une
    # requête sans réponse (coupure réseau, double-tap) sans créditer deux fois.
    idempotency_key = serializers.CharField(
        required=False, allow_null=True, allow_blank=True, max_length=64
    )

    def validate(self, attrs):
        amount = _parse_amount(attrs.get("montant_depose"))
        if amount is None:
            raise serializers.ValidationError({"detail": "Montant invalide ou absent."})
        if amount <= 0:
            raise serializers.ValidationError(
                {"detail": "Le montant à déposer doit être supérieur à zéro."}
            )
        # `Transaction.montant_transaction`/`solde_courant` sont des DecimalField à
        # decimal_places=0 (XOF n'a pas de sous-unité) : un montant décimal non entier
        # (ex "100.55") passerait `_parse_amount` mais ferait échouer `full_clean()`
        # au moment du `Transaction.objects.create()`, avec une ValidationError NON
        # rattrapée par la vue -> 500 Internal Server Error au lieu d'un 400 propre
        # (voir apps/wallet/tests/test_deposit.py::DepositViewTests.test_deposit_non_integer_amount).
        if amount != amount.to_integral_value():
            raise serializers.ValidationError(
                {"detail": "Le montant à déposer doit être un nombre entier (pas de centimes)."}
            )

        mode = _resolve_payment_mode(attrs.get("mode_de_paiement"))
        if mode is None:
            raise serializers.ValidationError({"detail": "Mode de paiement inconnu."})

        idempotency_key = (attrs.get("idempotency_key") or "").strip() or None

        return {
            "montant_depose": amount,
            "mode_de_paiement": mode,
            "idempotency_key": idempotency_key,
        }


class WithdrawalSerializer(serializers.Serializer):
    """Valide un retrait. Même logique de tolérance que DepositSerializer, plus le
    fallback historique montant_a_retirer -> montant_depose."""

    montant_a_retirer = serializers.CharField(required=False, allow_null=True)
    montant_depose = serializers.CharField(required=False, allow_null=True)
    mode_de_paiement = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    # Clé d'idempotence optionnelle (UUID côté client) : permet de rejouer une
    # requête sans réponse (coupure réseau, double-tap) sans débiter deux fois.
    idempotency_key = serializers.CharField(
        required=False, allow_null=True, allow_blank=True, max_length=64
    )

    def validate(self, attrs):
        raw_montant = attrs.get("montant_a_retirer")
        if raw_montant in (None, ""):
            raw_montant = attrs.get("montant_depose")
        amount = _parse_amount(raw_montant)
        if amount is None:
            raise serializers.ValidationError({"detail": "Montant invalide ou absent."})
        if amount <= 0:
            raise serializers.ValidationError(
                {"detail": "Le montant à retirer doit être supérieur à zéro."}
            )
        # Voir DepositSerializer.validate : même contrainte decimal_places=0 côté
        # modèle, même risque de 500 non rattrapé sinon.
        if amount != amount.to_integral_value():
            raise serializers.ValidationError(
                {"detail": "Le montant à retirer doit être un nombre entier (pas de centimes)."}
            )

        mode = _resolve_payment_mode(attrs.get("mode_de_paiement"))
        if mode is None:
            raise serializers.ValidationError({"detail": "Mode de paiement inconnu."})

        idempotency_key = (attrs.get("idempotency_key") or "").strip() or None

        return {
            "montant": amount,
            "mode_de_paiement": mode,
            "idempotency_key": idempotency_key,
        }
