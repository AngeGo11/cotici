from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("wallet", "0001_initial"),
    ]

    operations = [
        migrations.AlterField(
            model_name="transaction",
            name="type_transaction",
            field=models.CharField(
                choices=[
                    ("RETRAIT", "Retrait"),
                    ("DÉPÔT", "Dépôt"),
                    ("VERSEMENT_EPARGNE_PERSONNELLE", "Versement épargne personnelle"),
                    ("RETRAIT_EPARGNE_PERSONNELLE", "Retrait épargne personnelle"),
                    ("DÉBIT", "Débit"),
                ],
                max_length=35,
            ),
        ),
        migrations.RemoveConstraint(
            model_name="transaction",
            name="wallet_transaction_fk_coherence_type",
        ),
        migrations.AddConstraint(
            model_name="transaction",
            constraint=models.CheckConstraint(
                check=models.Q(
                    models.Q(
                        ("epargne__isnull", False),
                        ("tontine__isnull", True),
                        ("tour__isnull", True),
                        ("type_transaction", "VERSEMENT_EPARGNE_PERSONNELLE"),
                    ),
                    models.Q(
                        ("epargne__isnull", False),
                        ("tontine__isnull", True),
                        ("tour__isnull", True),
                        ("type_transaction", "RETRAIT_EPARGNE_PERSONNELLE"),
                    ),
                    models.Q(
                        ("epargne__isnull", True),
                        ("tontine__isnull", True),
                        ("tour__isnull", True),
                        ("type_transaction", "RETRAIT"),
                    ),
                    models.Q(
                        ("epargne__isnull", True),
                        ("tontine__isnull", True),
                        ("tour__isnull", True),
                        ("type_transaction", "DÉPÔT"),
                    ),
                    models.Q(
                        ("epargne__isnull", True),
                        ("tontine__isnull", False),
                        ("tour__isnull", False),
                        ("type_transaction", "DÉBIT"),
                    ),
                    _connector="OR",
                ),
                name="wallet_transaction_fk_coherence_type",
            ),
        ),
    ]
