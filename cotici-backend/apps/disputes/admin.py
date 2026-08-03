from django.contrib import admin

from apps.disputes.models import Dispute


@admin.register(Dispute)
class DisputeAdmin(admin.ModelAdmin):
    list_display = ("id", "subject", "category", "status", "opened_by", "opened_at", "resolved_by", "resolved_at")
    list_filter = ("status", "category")
    search_fields = ("subject", "description", "opened_by__numero_telephone", "opened_by__username")
    raw_id_fields = ("opened_by", "transaction", "tontine", "resolved_by")
    readonly_fields = ("opened_at", "updated_at")
