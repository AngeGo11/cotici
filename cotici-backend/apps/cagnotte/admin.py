from django.contrib import admin

from apps.cagnotte.models import Cagnotte


@admin.register(Cagnotte)
class CagnotteAdmin(admin.ModelAdmin):
    list_display = (
        "id",
        "nom_cagnotte",
        "description",
        "objectif_cotisation",
        "objectif_atteint",
        "recuperation_effectue",
        "hote",
    )
    search_fields = ("nom_cagnotte", "description")
