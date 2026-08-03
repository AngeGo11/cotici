from django.contrib import admin

from apps.solidarity.models import Solidarity


@admin.register(Solidarity)
class SolidarityAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "description",
        "objectif_cotisation",
        "objectif_atteint",
        "versement_effectue",
        "hote",
    )
    search_fields = ("description", "beneficiaire_telephone")
