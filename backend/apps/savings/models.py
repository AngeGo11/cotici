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


    class ETAT(models.TextChoices):
        ACTIF = "ACTIF", _("Actif")
        ARCHIVE = "ARCHIVÉ", _("Archivé")
        SUPPRIME = "SUPPRIMÉ", _("Supprimé")


    hote = models.ForeignKey(User, on_delete=models.CASCADE)
    nom_projet = models.CharField(max_length=50)
    objectif_cotisation = models.IntegerField()
    montant_courant = models.DecimalField(max_digits=10, decimal_places=0)
    categorie = models.CharField(max_length=50, choices=CATEGORIE.choices, blank=True, null=True)
    duree = models.IntegerField(default=0)
    etat = models.CharField(max_length=20, choices=ETAT.choices, default=ETAT.ACTIF)
    objectif_atteint = models.BooleanField(default=False)
    date_creation = models.DateField(auto_now_add=True)
    date_archivage = models.DateTimeField(null=True, blank=True)
    date_suppression = models.DateTimeField(null=True, blank=True)




