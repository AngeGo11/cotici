from rest_framework import serializers

from apps.notifications.models import NotificationPreference, Notifications, PushDevice


class NotificationSerializer(serializers.ModelSerializer):
    """Sérialiseur en lecture seule : le client ne peut jamais forger une notification.

    Toutes les notifications sont créées côté serveur (via `NotificationService`),
    jamais depuis une requête cliente — d'où `read_only_fields` sur la totalité
    des champs exposés.
    """

    class Meta:
        model = Notifications
        fields = [
            "id",
            "category",
            "objet",
            "contenu",
            "source_type",
            "source_id",
            "est_lue",
            "date_envoie",
            "date_lecture",
        ]
        read_only_fields = fields


class PushDeviceRegisterSerializer(serializers.Serializer):
    """Validation de `POST /api/notifications/devices/`.

    `user` n'est jamais dans le body : imposé côté vue depuis
    `request.user`, jamais depuis une valeur cliente (anti-IDOR).
    """

    expo_token = serializers.CharField(max_length=255, allow_blank=False)
    device_id = serializers.CharField(max_length=128, required=False, allow_blank=True, default="")
    platform = serializers.ChoiceField(choices=PushDevice.Platform.choices)
    app_version = serializers.CharField(max_length=20, required=False, allow_blank=True, default="")


class NotificationPreferenceSerializer(serializers.ModelSerializer):
    """Lecture/écriture des préférences de l'utilisateur connecté.

    Aucun champ `user` exposé : la vue résout toujours la préférence via
    `request.user` (`get_or_create`), jamais depuis un identifiant fourni par
    le client.
    """

    class Meta:
        model = NotificationPreference
        fields = ["push_enabled", "categories_muted"]

    def validate_categories_muted(self, value):
        if not isinstance(value, list):
            raise serializers.ValidationError("categories_muted doit être une liste.")
        valid = set(Notifications.Category.values)
        invalid = [v for v in value if v not in valid]
        if invalid:
            raise serializers.ValidationError(
                f"Catégorie(s) invalide(s) : {', '.join(map(str, invalid))}."
            )
        return value
