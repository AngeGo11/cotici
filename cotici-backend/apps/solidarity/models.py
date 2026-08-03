from django.db import models

from apps.tontine.models import Tontine


class Solidarity(Tontine):
    """
    Tontine solidaire : collecte ciblée vers un bénéficiaire.
    Hérite de Tontine (membres, QR, transactions) sans TontineRegle.
    """

    beneficiaire_telephone = models.CharField(max_length=15)
    objectif_cotisation = models.IntegerField(
        help_text="Montant cible de la collecte en FCFA.",
    )
    objectif_atteint = models.BooleanField(default=False)
    versement_effectue = models.BooleanField(
        default=False,
        help_text="Vrai une fois la collecte versée au bénéficiaire par l'organisateur.",
    )

    class Meta:
        verbose_name = "Tontine solidaire"
        verbose_name_plural = "Tontines solidaires"
        constraints = [
            models.CheckConstraint(
                check=models.Q(objectif_cotisation__gt=0),
                name="solidarity_objectif_cotisation_positif",
            ),
        ]

    def save(self, *args, **kwargs):
        self.type_tontine = Tontine.TYPE_TONTINE.SOLIDAIRE
        super().save(*args, **kwargs)
