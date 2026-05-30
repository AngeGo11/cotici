from django.db import models
from django.contrib.auth import get_user_model
from django.utils.translation import gettext_lazy as _
User = get_user_model()


# Create your models here.

class EpargnePersonnelle(models.Model):
    class CATEGORIE(models.TextChoices):
        VOYAGE = "VOYAGE", _("Voyage")
        PROJET = "PROJET PERSONNEL", _("Projet personnel")
        MARIAGE = "MARIAGE", _("Mariage")
        EDUCATION = "EDUCATION", _("Education")
        SANTE = "SANTÉ", _("Santé")
        AUTRE = "AUTRE", _("Autre")


    hote = models.ForeignKey(User, on_delete=models.CASCADE)
    nom_projet = models.CharField(max_length=50)
    objectif_cotisation = models.IntegerField()
    montant_courant = models.DecimalField(max_digits=10, decimal_places=0)
    categorie = models.CharField(max_length=50, choices=CATEGORIE.choices, blank=True, null=True)
    date_creation = models.DateField(auto_now_add=True)
    duree = models.IntegerField(default=0)


