from django.contrib import admin

from apps.notifications.models import (
    JobRun,
    NotificationPreference,
    Notifications,
    PushDevice,
    PushOutbox,
)


@admin.register(Notifications)
class NotificationsAdmin(admin.ModelAdmin):
    list_display = ("id", "category", "destinataire", "objet", "est_lue", "date_envoie")
    list_filter = ("category", "est_lue", "source_type")
    search_fields = ("objet", "contenu", "dedup_key", "destinataire__numero_telephone")
    raw_id_fields = ("destinataire", "expediteur")


@admin.register(PushDevice)
class PushDeviceAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "platform", "is_active", "failure_count", "last_seen_at")
    list_filter = ("platform", "is_active")
    search_fields = ("expo_token", "device_id", "user__numero_telephone")
    raw_id_fields = ("user",)


@admin.register(PushOutbox)
class PushOutboxAdmin(admin.ModelAdmin):
    list_display = ("id", "destinataire", "statut", "attempts", "next_attempt_at", "created_at")
    list_filter = ("statut",)
    raw_id_fields = ("destinataire", "notification")


@admin.register(NotificationPreference)
class NotificationPreferenceAdmin(admin.ModelAdmin):
    list_display = ("id", "user", "push_enabled")
    raw_id_fields = ("user",)


@admin.register(JobRun)
class JobRunAdmin(admin.ModelAdmin):
    list_display = ("job_name", "last_started_at", "last_success_at", "runs_ok", "runs_failed")
