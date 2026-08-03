from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import models
from django.utils import timezone
from django.utils.translation import gettext_lazy as _

# Create your models here.

User = get_user_model()


class Notifications(models.Model):

    class Category(models.TextChoices):
        INVITATION = "invitation", _("Invitation")
        COTISATION = "cotisation", _("Cotisation")
        PAIEMENT = "paiement", _("Paiement")
        SECURITE = "securite", _("Sécurité")
        EPARGNE = "epargne", _("Épargne")
        GESTION = "gestion", _("Gestion du groupe")

    class SourceType(models.TextChoices):
        TONTINE = "tontine", _("Tontine")
        CAGNOTTE = "cagnotte", _("Cagnotte")
        SOLIDARITY = "solidarity", _("Solidarité")
        WALLET = "wallet", _("Portefeuille")
        TRANSACTION = "transaction", _("Transaction")
        INVITATION = "invitation", _("Invitation")
        AUTH = "auth", _("Authentification")
        SAVINGS = "savings", _("Épargne personnelle")

    # Une notification système (rappel de cotisation, alerte sécurité) n'a pas
    # d'expéditeur humain : nullable, et la suppression de l'expéditeur ne doit
    # jamais faire disparaître la notification déjà envoyée (SET_NULL).
    expediteur = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='notifications_envoyees',
    )
    destinataire = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications_recues')
    objet = models.CharField(max_length=255)
    contenu = models.CharField(max_length=500)
    category = models.CharField(max_length=20, choices=Category.choices)
    # Référence structurée (mais non contrainte par une vraie FK/GenericForeignKey,
    # cohérent avec le pattern déjà utilisé par apps.audits.AuditLog.resource, ici
    # en version typée) vers l'objet métier à l'origine de la notification.
    source_type = models.CharField(max_length=20, choices=SourceType.choices, blank=True, default="")
    source_id = models.BigIntegerField(null=True, blank=True)
    # Clé d'idempotence pour les rappels (ex: cotisation à venir) : PostgreSQL
    # ignore les NULL dans une contrainte unique, donc les notifications
    # événementielles (dedup_key=None) ne sont jamais bloquées entre elles.
    dedup_key = models.CharField(max_length=255, null=True, blank=True, unique=True)
    date_envoie = models.DateTimeField(auto_now_add=True)
    date_lecture = models.DateTimeField(null=True, blank=True)
    est_lue = models.BooleanField(default=False)

    class Meta:
        ordering = ["-date_envoie"]
        indexes = [
            models.Index(fields=["destinataire", "est_lue"]),
            models.Index(fields=["destinataire", "-date_envoie"]),
            # La purge (`purge_notifications`) filtre en masse sur `date_envoie` :
            # sans cet index, chaque exécution du job hebdomadaire ferait un
            # seq scan complet de la table.
            models.Index(fields=["date_envoie"]),
        ]

    def __str__(self) -> str:
        return f"[{self.category}] {self.objet} -> {self.destinataire_id}"


class PushDevice(models.Model):
    """Appareil mobile enregistré pour recevoir des push Expo.

    `expo_token` est **unique globalement**, pas par utilisateur : un token
    Expo est attribué à une installation (device+app), pas à une personne. Si
    le téléphone change de propriétaire (revente, réinstallation avec un
    autre compte COTICI), le même token peut être ré-émis par Expo pour le
    nouvel utilisateur. `update_or_create(expo_token=...)` fait alors migrer
    le device vers le nouvel utilisateur — sans cette unicité globale,
    l'ancien propriétaire continuerait de recevoir les notifications du
    nouveau (fuite d'information grave, cf. `POST /devices/`).
    """

    class Platform(models.TextChoices):
        IOS = "ios", _("iOS")
        ANDROID = "android", _("Android")

    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="push_devices")
    expo_token = models.CharField(max_length=255, unique=True)
    device_id = models.CharField(max_length=128, blank=True, default="")
    platform = models.CharField(max_length=10, choices=Platform.choices)
    app_version = models.CharField(max_length=20, blank=True, default="")
    is_active = models.BooleanField(default=True)
    failure_count = models.PositiveSmallIntegerField(default=0)
    last_error = models.CharField(max_length=100, blank=True, default="")
    last_seen_at = models.DateTimeField(default=timezone.now)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["user", "is_active"]),
        ]
        constraints = [
            # Un même appareil physique (device_id fourni par le client) ne doit
            # apparaître qu'une fois par utilisateur — condition sur device_id
            # non vide car tous les clients ne l'envoient pas encore.
            models.UniqueConstraint(
                fields=["user", "device_id"],
                condition=models.Q(device_id__gt=""),
                name="uniq_pushdevice_user_device_id",
            ),
        ]

    def __str__(self) -> str:
        return f"PushDevice(user={self.user_id}, platform={self.platform}, active={self.is_active})"


class PushOutbox(models.Model):
    """Transactional outbox pour les push Expo.

    Une ligne est créée dans le MÊME savepoint que la `Notifications`
    d'origine (voir `NotificationService`), puis dépilée de façon
    asynchrone par la command `push_dispatch`. Ce découplage garantit
    qu'un incident réseau/Expo ne bloque jamais l'opération métier ni la
    création de la notification in-app (journal toujours écrit).
    """

    class Statut(models.TextChoices):
        QUEUED = "QUEUED", _("En attente")
        SENDING = "SENDING", _("En cours d'envoi")
        SENT = "SENT", _("Envoyé")
        FAILED = "FAILED", _("Échoué")
        DROPPED = "DROPPED", _("Abandonné")

    notification = models.ForeignKey(
        Notifications,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="push_outbox_entries",
    )
    destinataire = models.ForeignKey(User, on_delete=models.CASCADE, related_name="push_outbox_entries")
    titre = models.CharField(max_length=255)
    corps = models.CharField(max_length=500)
    # Payload de deep-link consommé par le mobile : {source_type, source_id,
    # category, notification_id}. Voir contrat API figé.
    data = models.JSONField(default=dict, blank=True)
    statut = models.CharField(max_length=10, choices=Statut.choices, default=Statut.QUEUED)
    attempts = models.PositiveSmallIntegerField(default=0)
    next_attempt_at = models.DateTimeField(default=timezone.now)
    ticket_id = models.CharField(max_length=64, blank=True, default="")
    receipt_checked_at = models.DateTimeField(null=True, blank=True)
    error_code = models.CharField(max_length=64, blank=True, default="")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        indexes = [
            models.Index(fields=["statut", "next_attempt_at"]),
            models.Index(fields=["statut", "receipt_checked_at"]),
        ]

    def __str__(self) -> str:
        return f"PushOutbox(destinataire={self.destinataire_id}, statut={self.statut})"


class NotificationPreference(models.Model):
    """Préférences push d'un utilisateur.

    `categories_muted` contient des valeurs de `Notifications.Category`
    (validées en code, pas en base — JSONField ne supporte pas de choices).
    Ne s'applique jamais aux catégories de `domain.preferences.MANDATORY_CATEGORIES`
    (sécurité, paiement) : un mouvement d'argent doit toujours être notifié.
    """

    user = models.OneToOneField(
        User, on_delete=models.CASCADE, related_name="notification_preference"
    )
    push_enabled = models.BooleanField(default=True)
    categories_muted = models.JSONField(default=list, blank=True)
    quiet_hours_start = models.TimeField(null=True, blank=True)
    quiet_hours_end = models.TimeField(null=True, blank=True)

    def __str__(self) -> str:
        return f"NotificationPreference(user={self.user_id})"


class JobRun(models.Model):
    """Heartbeat des management commands planifiées par cron.

    Sans ce journal, un cron qui échoue silencieusement (crash, verrou jamais
    relâché, erreur réseau permanente) est invisible tant qu'un utilisateur
    ne se plaint pas de ne pas recevoir de notification.
    """

    job_name = models.CharField(max_length=100, unique=True)
    last_started_at = models.DateTimeField(null=True, blank=True)
    last_success_at = models.DateTimeField(null=True, blank=True)
    last_error = models.TextField(blank=True, default="")
    runs_ok = models.PositiveIntegerField(default=0)
    runs_failed = models.PositiveIntegerField(default=0)

    def __str__(self) -> str:
        return f"JobRun({self.job_name})"
