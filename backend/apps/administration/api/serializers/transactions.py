"""Serializers de consultation/forçage de statut des transactions
(`/api/admin/transactions/`)."""
from __future__ import annotations

from rest_framework import serializers

from apps.wallet.models import Transaction
from apps.administration.api.serializers.pii import MaskedPhoneField


class TransactionTitulaireSerializer(serializers.Serializer):
    """Identité minimale du titulaire du wallet concerné par la transaction.

    Le numéro de téléphone est bien l'identifiant fonctionnel du compte, mais
    c'en est aussi la donnée personnelle principale : il est donc masqué ici
    comme partout ailleurs (voir `serializers/pii.py`). Le laisser en clair
    permettrait de reconstituer un fichier clients depuis cet écran, sans
    jamais déclencher la trace exigée par `user.pii_reveal`.
    """

    id = serializers.IntegerField()
    username = serializers.CharField()
    numero_telephone_masque = MaskedPhoneField(source="numero_telephone")
    first_name = serializers.CharField()
    last_name = serializers.CharField()


class AdminTransactionListSerializer(serializers.ModelSerializer):
    """Ligne de la liste `GET /api/admin/transactions/`."""

    type_transaction_display = serializers.CharField(
        source="get_type_transaction_display", read_only=True
    )
    mode_de_paiement_display = serializers.CharField(
        source="get_mode_de_paiement_display", read_only=True
    )
    statut_transaction_display = serializers.CharField(
        source="get_statut_transaction_display", read_only=True
    )
    titulaire = TransactionTitulaireSerializer(source="wallet.user", read_only=True)

    class Meta:
        model = Transaction
        fields = [
            "id",
            "ref_transaction",
            "client_ref",
            "wallet",
            "titulaire",
            "type_transaction",
            "type_transaction_display",
            "mode_de_paiement",
            "mode_de_paiement_display",
            "montant_transaction",
            "solde_courant",
            "statut_transaction",
            "statut_transaction_display",
            "date_transaction",
        ]
        read_only_fields = fields


class AdminTransactionDetailSerializer(AdminTransactionListSerializer):
    """Fiche détail `GET /api/admin/transactions/{id}/` : ajoute les
    rattachements métier éventuels (tontine, tour, épargne)."""

    class Meta(AdminTransactionListSerializer.Meta):
        fields = AdminTransactionListSerializer.Meta.fields + ["tontine", "tour", "epargne"]
        read_only_fields = fields


class TransactionForceStatusSerializer(serializers.Serializer):
    """Corps de `POST /api/admin/transactions/{id}/force-status/`.

    `new_status` est volontairement validé comme un choix de statut valide au
    niveau du serializer ; la restriction aux transitions RÉELLEMENT
    autorisées (depuis `EN ATTENTE` uniquement, vers un sous-ensemble de
    statuts terminaux) est appliquée dans
    `services.transaction_admin_service.force_status`, au plus près de la
    donnée.
    """

    new_status = serializers.ChoiceField(choices=Transaction.STATUT_TRANSACTION.choices)
    reason = serializers.CharField(
        allow_blank=False, help_text="Motif obligatoire (action sensible)."
    )
