from django.contrib.auth import get_user_model
from django.db import models

# Create your models here.

User = get_user_model()

class Notifications(models.Model):
    expediteur = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications_envoyees')
    destinataire = models.ForeignKey(User, on_delete=models.CASCADE, related_name='notifications_recues')
    objet = models.CharField(max_length=255)
    contenu = models.CharField(max_length=255)
    date_envoie = models.DateTimeField()
    est_lue = models.BooleanField(default=False)

