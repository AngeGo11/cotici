from django.contrib import admin

from .models import StaffLoginAttempt, StaffProfile


@admin.register(StaffProfile)
class StaffProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "role", "is_active", "totp_confirmed_at", "last_login_ip", "created_at")
    list_filter = ("role", "is_active")
    search_fields = ("user__username", "user__numero_telephone", "user__email")
    # Le secret TOTP ne doit jamais être affichable/éditable depuis l'admin Django.
    exclude = ("totp_secret",)
    readonly_fields = ("totp_confirmed_at", "last_totp_counter", "created_at", "updated_at")


@admin.register(StaffLoginAttempt)
class StaffLoginAttemptAdmin(admin.ModelAdmin):
    list_display = ("created_at", "username_tried", "stage", "success", "ip_address")
    list_filter = ("stage", "success")
    search_fields = ("username_tried", "ip_address")
    readonly_fields = [f.name for f in StaffLoginAttempt._meta.fields]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
