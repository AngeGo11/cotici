from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("tontine", "0007_tontinemembre_regles_acceptees"),
    ]

    operations = [
        migrations.AddField(
            model_name="tontine",
            name="beneficiaire_telephone",
            field=models.CharField(blank=True, default="", max_length=15),
        ),
    ]
