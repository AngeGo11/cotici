from rest_framework import serializers

from apps.utils.utilitaires import _parse_positive_int, _resolve_payment_mode

VALID_CATEGORIES = ["Voyage", "Projet personnel", "Mariage", "Éducation", "Santé", "Autre"]


def _resolve_categorie(data):
    """Retourne (categorie, message_erreur). message_erreur est None si valide."""
    categorie_choisie = (data.get("categorie") or "").strip()
    if categorie_choisie == "Autre":
        categorie = (data.get("value_categorie") or "").strip()
        if not categorie:
            return None, "Veuillez préciser la catégorie de votre projet."
        return categorie, None
    if categorie_choisie in VALID_CATEGORIES:
        return categorie_choisie, None
    return None, "Catégorie invalide."


class GoalIdSerializer(serializers.Serializer):
    """Valide un identifiant d'objectif reçu en body (POST) ou en query params (GET)."""

    id = serializers.CharField(required=False, allow_null=True)

    def validate(self, attrs):
        goal_id = _parse_positive_int(attrs.get("id"))
        if goal_id is None:
            raise serializers.ValidationError({"detail": "Identifiant d'objectif invalide."})
        return {"id": goal_id}


class SavingsPayloadSerializer(serializers.Serializer):
    """Champs communs à la création et à la modification d'un objectif d'épargne."""

    nom_projet = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    montant_cible = serializers.CharField(required=False, allow_null=True)
    duree = serializers.CharField(required=False, allow_null=True)
    categorie = serializers.CharField(required=False, allow_null=True, allow_blank=True)
    value_categorie = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    def validate(self, attrs):
        nom_projet = (attrs.get("nom_projet") or "").strip()
        if not nom_projet:
            raise serializers.ValidationError({"detail": "Le nom du projet est obligatoire."})

        montant_cible = _parse_positive_int(attrs.get("montant_cible"))
        if montant_cible is None:
            raise serializers.ValidationError({"detail": "Entrez le montant cible."})

        montant_courant = self.context.get("montant_courant")
        if montant_courant is not None and montant_cible < montant_courant:
            raise serializers.ValidationError(
                {"detail": "Le montant cible ne peut pas être inférieur au montant déjà épargné."}
            )

        duree = _parse_positive_int(attrs.get("duree"))
        if duree is None:
            raise serializers.ValidationError({"detail": "Veuillez préciser la durée."})

        categorie, categorie_error = _resolve_categorie(attrs)
        if categorie_error is not None:
            raise serializers.ValidationError({"detail": categorie_error})

        return {
            "nom_projet": nom_projet,
            "montant_cible": montant_cible,
            "duree": duree,
            "categorie": categorie,
        }


class DepositSavingsSerializer(serializers.Serializer):
    id = serializers.CharField(required=False, allow_null=True)
    montant = serializers.CharField(required=False, allow_null=True)
    mode_de_paiement = serializers.CharField(required=False, allow_null=True, allow_blank=True)

    def validate(self, attrs):
        goal_id = _parse_positive_int(attrs.get("id"))
        if goal_id is None:
            raise serializers.ValidationError({"detail": "Identifiant d'objectif invalide."})

        montant = _parse_positive_int(attrs.get("montant"))
        if montant is None:
            raise serializers.ValidationError({"detail": "Montant invalide."})

        mode = _resolve_payment_mode(attrs.get("mode_de_paiement"))
        if mode is None:
            raise serializers.ValidationError({"detail": "Mode de paiement inconnu."})

        return {"id": goal_id, "montant": montant, "mode_de_paiement": mode}
