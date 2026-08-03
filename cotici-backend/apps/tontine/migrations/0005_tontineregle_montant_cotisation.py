from decimal import Decimal

from django.db import migrations, models


def forwards_split_cotisation_fields(apps, schema_editor):
    """Ancien objectif_cotisation = mise par participant → montant_cotisation ; objectif = pot max."""
    TontineRegle = apps.get_model("tontine", "TontineRegle")
    for regle in TontineRegle.objects.all():
        per_participant = regle.objectif_cotisation
        regle.montant_cotisation = per_participant
        regle.objectif_cotisation = per_participant * Decimal(regle.nombre_max)
        regle.save(update_fields=["montant_cotisation", "objectif_cotisation"])


def backwards_merge_cotisation_fields(apps, schema_editor):
    TontineRegle = apps.get_model("tontine", "TontineRegle")
    for regle in TontineRegle.objects.all():
        regle.objectif_cotisation = regle.montant_cotisation
        regle.save(update_fields=["objectif_cotisation"])


class Migration(migrations.Migration):

    dependencies = [
        ("tontine", "0004_tourtontine_statut_tour_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="tontineregle",
            name="montant_cotisation",
            field=models.DecimalField(
                decimal_places=0,
                default=0,
                help_text="Mise versée par chaque participant à chaque tour.",
                max_digits=10,
            ),
            preserve_default=False,
        ),
        migrations.RunPython(forwards_split_cotisation_fields, backwards_merge_cotisation_fields),
    ]
