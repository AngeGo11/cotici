from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("solidarity", "0001_initial"),
    ]

    operations = [
        migrations.AddField(
            model_name="solidarity",
            name="versement_effectue",
            field=models.BooleanField(
                default=False,
                help_text="Vrai une fois la collecte versée au bénéficiaire par l'organisateur.",
            ),
        ),
    ]
