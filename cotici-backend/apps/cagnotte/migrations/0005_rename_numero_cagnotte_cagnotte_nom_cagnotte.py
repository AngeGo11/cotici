from django.db import migrations, models


class Migration(migrations.Migration):
    """
    Renomme `numero_cagnotte` (bug : normalisé comme un numéro de téléphone) en
    `nom_cagnotte` (nom libre de la cagnotte, ex. "Construction mosquée du village").
    Passe également le champ de max_length=15 à 255 pour autoriser un nom libre.

    La table `cagnotte_cagnotte` étant vide en production au moment de cette
    migration, un simple RenameField + AlterField est suffisant (aucune donnée à
    migrer).
    """

    dependencies = [
        ("cagnotte", "0004_cagnotte_cagnotte_objectif_cotisation_positif"),
    ]

    operations = [
        migrations.RenameField(
            model_name="cagnotte",
            old_name="numero_cagnotte",
            new_name="nom_cagnotte",
        ),
        migrations.AlterField(
            model_name="cagnotte",
            name="nom_cagnotte",
            field=models.CharField(max_length=255),
        ),
    ]
