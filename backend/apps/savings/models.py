from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()


# Create your models here.

class EpargnePersonnelle(models.Model):
    hote = models.ForeignKey(User, on_delete=models.CASCADE)
    nom_projet = models.CharField(max_length=50)
    objectif_cotisation = models.IntegerField()
    montant_courant = models.DecimalField(max_digits=10, decimal_places=0)
    date_creation = models.DateField(auto_now_add=True)


