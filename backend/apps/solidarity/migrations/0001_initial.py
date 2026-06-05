import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        ("tontine", "0009_remove_tontine_beneficiaire_telephone_and_more"),
    ]

    operations = [
        migrations.CreateModel(
            name="Solidarity",
            fields=[
                (
                    "tontine_ptr",
                    models.OneToOneField(
                        auto_created=True,
                        on_delete=django.db.models.deletion.CASCADE,
                        parent_link=True,
                        primary_key=True,
                        serialize=False,
                        to="tontine.tontine",
                    ),
                ),
                ("beneficiaire_telephone", models.CharField(max_length=15)),
                (
                    "objectif_cotisation",
                    models.IntegerField(
                        help_text="Montant cible de la collecte en FCFA.",
                    ),
                ),
                ("objectif_atteint", models.BooleanField(default=False)),
            ],
            options={
                "verbose_name": "Tontine solidaire",
                "verbose_name_plural": "Tontines solidaires",
            },
            bases=("tontine.tontine",),
        ),
    ]
