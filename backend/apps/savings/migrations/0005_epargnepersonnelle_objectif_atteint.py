from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("savings", "0004_epargnepersonnelle_date_archivage_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="epargnepersonnelle",
            name="objectif_atteint",
            field=models.BooleanField(default=False),
        ),
    ]
