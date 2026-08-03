from rest_framework import serializers

from apps.utils.utilitaires import (
    _parse_positive_decimal,
    _parse_positive_int,
    _resolve_payment_mode,
)
from apps.wallet.models import Transaction


class CreateCagnotteSerializer(serializers.Serializer):
    nom_cagnotte = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    description_projet = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    objectif_collecte = serializers.CharField(required=False, allow_null=True)

    def validate(self, attrs):
        nom_cagnotte = str(attrs.get("nom_cagnotte") or "").strip()
        if not nom_cagnotte:
            raise serializers.ValidationError(
                {"detail": "Le nom de la cagnotte est obligatoire."}
            )
        if len(nom_cagnotte) < 3 or len(nom_cagnotte) > 255:
            raise serializers.ValidationError(
                {"detail": "Le nom de la cagnotte doit contenir entre 3 et 255 caractères."}
            )

        description_projet = str(attrs.get("description_projet") or "").strip()
        if not description_projet:
            raise serializers.ValidationError(
                {"detail": "La description_projet est obligatoire."}
            )
        if len(description_projet) > 300:
            raise serializers.ValidationError(
                {"detail": "Le description_projet est trop long (300 caractères max)."}
            )

        objectif = _parse_positive_int(attrs.get("objectif_collecte"))
        if objectif is None:
            raise serializers.ValidationError(
                {"detail": "L'objectif de la collecte doit être un montant entier positif."}
            )

        return {
            "nom_cagnotte": nom_cagnotte,
            "description_projet": description_projet,
            "objectif_collecte": objectif,
        }


class CotiserCagnotteSerializer(serializers.Serializer):
    tontine_id = serializers.CharField(required=False, allow_null=True)
    montant = serializers.CharField(required=False, allow_null=True)
    mode_de_paiement = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    # Clé d'idempotence optionnelle (UUID côté client) : permet de rejouer une
    # requête sans réponse (coupure réseau, double-tap) sans cotiser deux fois.
    idempotency_key = serializers.CharField(
        required=False, allow_null=True, allow_blank=True, max_length=64
    )

    def validate(self, attrs):
        tontine_id = attrs.get("tontine_id")
        if tontine_id in (None, ""):
            raise serializers.ValidationError({"detail": "tontine_id requis."})

        montant = _parse_positive_decimal(attrs.get("montant"))
        if montant is None:
            raise serializers.ValidationError(
                {"detail": "Veuillez renseigner un montant de participation valide."}
            )

        mode = _resolve_payment_mode(attrs.get("mode_de_paiement"))
        if mode is None:
            mode = Transaction.MODE_DE_PAIEMENT.SOLDE_COTICI

        idempotency_key = (attrs.get("idempotency_key") or "").strip() or None

        return {
            "tontine_id": tontine_id,
            "montant": montant,
            "mode_de_paiement": mode,
            "idempotency_key": idempotency_key,
        }
