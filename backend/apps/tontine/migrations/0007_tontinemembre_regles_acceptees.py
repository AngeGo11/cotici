from django.db import migrations, models
from django.utils import timezone


def mark_existing_members_accepted(apps, schema_editor):
    TontineMembre = apps.get_model("tontine", "TontineMembre")
    now = timezone.now()
    TontineMembre.objects.filter(regles_acceptees=False).update(
        regles_acceptees=True,
        date_acceptation_regles=now,
    )


class Migration(migrations.Migration):

    dependencies = [
        ("tontine", "0006_alter_tontineregle_objectif_cotisation"),
    ]

    operations = [
        migrations.AddField(
            model_name="tontinemembre",
            name="regles_acceptees",
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name="tontinemembre",
            name="date_acceptation_regles",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.RunPython(mark_existing_members_accepted, migrations.RunPython.noop),
    ]
