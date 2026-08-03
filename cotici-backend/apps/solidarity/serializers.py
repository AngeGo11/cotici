from django.contrib.auth import get_user_model
from rest_framework import serializers

from apps.tontine.helpers import phones_match
from apps.utils.utilitaires import (
    _normalize_phone,
    _parse_positive_decimal,
    _parse_positive_int,
    _resolve_payment_mode,
    _resolve_user_by_phone_exact,
)
from apps.wallet.models import Transaction

User = get_user_model()


def _resolve_user_by_phone(phone_raw: str):
    return _resolve_user_by_phone_exact(phone_raw)


class SolidarityIdSerializer(serializers.Serializer):
    id = serializers.CharField(required=False, allow_null=True)

    def validate(self, attrs):
        solidarity_id = _parse_positive_int(attrs.get("id"))
        if solidarity_id is None:
            raise serializers.ValidationError({"detail": "Identifiant de collecte invalide."})
        return {"id": solidarity_id}


class CreateSolidaritySerializer(serializers.Serializer):
    beneficiaire = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    motif = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    objectif_collecte = serializers.CharField(required=False, allow_null=True)

    def validate(self, attrs):
        beneficiaire_phone = _normalize_phone(str(attrs.get("beneficiaire") or ""))
        if not beneficiaire_phone:
            raise serializers.ValidationError(
                {"detail": "Le numéro du bénéficiaire est obligatoire."}
            )

        if _resolve_user_by_phone(beneficiaire_phone) is None:
            raise serializers.ValidationError(
                {"detail": "Aucun compte Cotici trouvé pour ce numéro de bénéficiaire."}
            )

        motif = str(attrs.get("motif") or "").strip()
        if not motif:
            raise serializers.ValidationError({"detail": "Le motif est obligatoire."})
        if len(motif) > 300:
            raise serializers.ValidationError(
                {"detail": "Le motif est trop long (300 caractères max)."}
            )

        objectif = _parse_positive_int(attrs.get("objectif_collecte"))
        if objectif is None:
            raise serializers.ValidationError(
                {"detail": "L'objectif de la collecte doit être un montant entier positif."}
            )

        user = self.context.get("user")
        if user is not None and phones_match(beneficiaire_phone, user):
            raise serializers.ValidationError(
                {"detail": "Le bénéficiaire ne peut pas être l'organisateur du groupe."}
            )

        return {
            "beneficiaire_phone": beneficiaire_phone,
            "motif": motif,
            "objectif_collecte": objectif,
        }


class CotiserSolidaritySerializer(serializers.Serializer):
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
