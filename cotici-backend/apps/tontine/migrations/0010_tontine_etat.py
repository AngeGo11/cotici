from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tontine", "0009_remove_tontine_beneficiaire_telephone_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="tontine",
            name="date_archivage",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="tontine",
            name="date_suppression",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="tontine",
            name="etat",
            field=models.CharField(
                choices=[
                    ("ACTIF", "Actif"),
                    ("ARCHIVÉ", "Archivé"),
                    ("SUPPRIMÉ", "Supprimé"),
                ],
                default="ACTIF",
                max_length=20,
            ),
        ),
    ]
