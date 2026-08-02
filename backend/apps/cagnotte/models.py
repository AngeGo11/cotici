from django.db import models
from apps.tontine.models import Tontine


class Cagnotte(Tontine):
    """
    Tontine solidaire : collecte ciblée vers un bénéficiaire.
    Hérite de Tontine (membres, QR, transactions) sans TontineRegle.
    """

    nom_cagnotte = models.CharField(max_length=255)
    objectif_cotisation = models.IntegerField(
        help_text="Montant cible de la collecte en FCFA.",
    )
    objectif_atteint = models.BooleanField(default=False)
    recuperation_effectue = models.BooleanField(
        default=False,
        help_text="Récupération de la collecte par l'organisateur.",
    )

    class Meta:
        verbose_name = "Cagnotte"
        verbose_name_plural = "Cagnotte"
        constraints = [
            models.CheckConstraint(
                check=models.Q(objectif_cotisation__gt=0),
                name="cagnotte_objectif_cotisation_positif",
            ),
        ]

    def save(self, *args, **kwargs):
        self.type_tontine = Tontine.TYPE_TONTINE.CAGNOTTE
        super().save(*args, **kwargs)
