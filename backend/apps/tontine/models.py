from django.contrib.auth import get_user_model
from django.db import models
from django.utils.translation import gettext_lazy as _

# Create your models here.
User = get_user_model()


class Tontine(models.Model):

    class TYPE_TONTINE(models.TextChoices):
        SOLIDAIRE = 'SOLIDAIRE', _('Tontine Solidaire')
        GROUPE = 'GROUPE', _('Tontine de groupe')
        CAGNOTTE = 'CAGNOTTE', _("Cagnotte Association")



    hote = models.ForeignKey(User, on_delete=models.CASCADE) # Clé étrangère vers user
    type_tontine = models.CharField(choices=TYPE_TONTINE.choices, max_length=50)
    est_active = models.BooleanField(default=True)
    date_creation = models.DateTimeField(auto_now_add=True)
    description = models.CharField(max_length=300)
    qr_code = models.CharField(max_length=500)
    membres = models.ManyToManyField(User, through='TontineMembre', related_name='tontines_membres')




class TontineMembre(models.Model):

    class ROLE_MEMBRE(models.TextChoices):
        ADMIN = 'ADMINISTRATEUR', _('Administrateur')
        PARTICIPANT = 'PARTICIPANT', _('Participant')

    class STATUT_MEMBRE(models.TextChoices):
        ACTIF = 'ACTIF', _('Actif')
        EXCLU = 'EXCLU', _('Exclu')
        A_QUITTER = 'A QUITTÉ', _('A quitté')

    tontine = models.ForeignKey(Tontine, on_delete=models.CASCADE)
    membre = models.ForeignKey(User, on_delete=models.CASCADE)
    role_membre = models.CharField(choices=ROLE_MEMBRE.choices, max_length=50)
    statut_membre = models.CharField(choices=STATUT_MEMBRE.choices, max_length=50)
    date_adhesion = models.DateTimeField(auto_now_add=True)
    ordre_ramassage = models.IntegerField()


    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["tontine", "membre"],
                name="uniq_tontine_membre",
            ),
            models.UniqueConstraint(
                fields=["tontine", "ordre_ramassage"],
                name="uniq_tontine_ordre_ramassage",
            ),
        ]





class Invitations(models.Model):


    class STATUT_INVITATION(models.TextChoices):
        EN_ATTENTE = "EN ATTENTE", _("En attente")
        ACCEPTEE = "ACCEPTÉE", _("Acceptée")


    tontine = models.ForeignKey(Tontine, on_delete=models.CASCADE)
    numero_telephone_invite = models.CharField(max_length=15)
    statut_invitation = models.CharField(max_length=20, choices=STATUT_INVITATION.choices, default=STATUT_INVITATION.EN_ATTENTE)
    est_utilisee = models.BooleanField(default=False)
    date_invitation = models.DateTimeField(auto_now_add=True)


    token = models.CharField(
        max_length=64,
        primary_key=True,
        editable=False,
        help_text="Jeton opaque unique (clé de sécurité primaire).",
    )

    @property
    def hote(self):
        """Hôte actuel de la tontine (plus de colonne dupliquée)."""
        return self.tontine.hote


class TontineRegle(models.Model):

    class FREQUENCE_COTISATION(models.TextChoices):
        HEBDOMADAIRE = "HEBDOMADAIRE", _("Hebdomadaire")
        JOURNALIER = "JOURNALIER", _("Journalier")
        MENSUEL = "MENSUEL", _("Mensuel")
        PERSONNALISE = "PERSONNALISÉE", _("Personnalisée")



    tontine = models.OneToOneField(Tontine, on_delete=models.CASCADE)
    objectif_cotisation = models.DecimalField(max_digits=10, decimal_places=0)
    montant_penalite = models.DecimalField(max_digits=10, decimal_places=0)
    nombre_max = models.IntegerField()
    ordre_aleatoire = models.BooleanField(default=False)
    frequence = models.CharField(choices= FREQUENCE_COTISATION.choices, max_length=25)
    frequence_personalise = models.IntegerField(blank=True, null=True)



class TourTontine(models.Model):
    tontine = models.ForeignKey(Tontine, on_delete=models.CASCADE)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    montant_depose = models.DecimalField(max_digits=10, decimal_places=0)
    date = models.DateTimeField(auto_now_add=True)
    numero_du_tour = models.IntegerField()

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["tontine", "numero_du_tour"],
                name="uniq_tontine_numero_tour",
            ),
        ]



class Penalite(models.Model):

    class TYPE_PENALITE(models.TextChoices):
        RETARD_PAIEMENT = "RETARD PAIEMENT", _("Retard de paiement")
        ABSENCE_PAIEMENT = "ABSENCE PAIEMENT", _("Absence de paiement")


    tontine = models.ForeignKey(Tontine, on_delete=models.CASCADE)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    montant_penalite = models.DecimalField(max_digits=10, decimal_places=0)
    montant_due = models.DecimalField(max_digits=10, decimal_places=0)
    type_penalite = models.CharField(choices = TYPE_PENALITE.choices, max_length=25)
    est_reglee = models.BooleanField(default=False)
    date_attribution_penalite = models.DateTimeField(auto_now_add=True)
    date_reglement_penalite = models.DateTimeField(auto_now_add=False, null=True, blank=True)


class Chat(models.Model):
    tontine = models.ForeignKey(Tontine, on_delete=models.CASCADE)
    expediteur = models.ForeignKey(User, on_delete=models.CASCADE)
    contenu = models.CharField(max_length=255)
    date = models.DateTimeField(auto_now_add=True)
