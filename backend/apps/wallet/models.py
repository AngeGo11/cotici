from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.savings.models import EpargnePersonnelle
from apps.tontine.models import Tontine, TourTontine

# Create your models here.

User = get_user_model()


class Wallet(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)  # Clé étrangère vers user
    solde_courant = models.DecimalField(max_digits=10, decimal_places=0, default=0)


class Transaction(models.Model):

    class MODE_DE_PAIEMENT(models.TextChoices):
        ORANGE = "ORANGE", _("Orange")
        MTN = "MTN", _("Mtn")
        WAVE = "WAVE", _("Wave")
        MOOV = "MOOV", _("Moov")
        SOLDE_COTICI = "SOLDE_COTICI", _("Solde Cotici")

    class STATUT_TRANSACTION(models.TextChoices):
        EN_ATTENTE = "EN ATTENTE", _("En attente")
        ANNULE = "ANNULÉE", _("Annulée")
        REUSSIE = "RÉUSSIE", _("Réussie")
        ECHOUEE = "ÉCHOUÉE", _("Échouée")

    class TYPE_TRANSACTION(models.TextChoices):
        RETRAIT = "RETRAIT", _("Retrait")
        DEPOT = "DÉPÔT", _("Dépôt")
        VERSEMENT_EPARGNE_PERSONNELLE = "VERSEMENT_EPARGNE_PERSONNELLE", _("Versement épargne personnelle")
        DEBIT = "DÉBIT", _("Débit")

    tontine = models.ForeignKey(Tontine, on_delete=models.CASCADE, null=True, blank=True)
    epargne = models.ForeignKey(EpargnePersonnelle, on_delete=models.CASCADE, null=True, blank=True)
    wallet = models.ForeignKey(Wallet, on_delete=models.CASCADE)
    tour = models.ForeignKey(TourTontine, on_delete=models.CASCADE, null=True, blank=True)
    solde_courant = models.DecimalField(max_digits=10, decimal_places=0)
    ref_transaction = models.CharField(max_length=25, unique=True)
    mode_de_paiement = models.CharField(choices=MODE_DE_PAIEMENT.choices, max_length=20)
    date_transaction = models.DateTimeField(auto_now_add=True)
    montant_transaction = models.DecimalField(max_digits=10, decimal_places=0)
    statut_transaction = models.CharField(
        choices=STATUT_TRANSACTION.choices,
        default=STATUT_TRANSACTION.EN_ATTENTE,
        max_length=20,
    )
    type_transaction = models.CharField(choices=TYPE_TRANSACTION.choices, max_length=35)

    class Meta:
        # Valeurs = clés stockées (TYPE_TRANSACTION) ; Meta ne voit pas encore la classe interne.
        constraints = [
            models.CheckConstraint(
                check=(
                    models.Q(
                        type_transaction="VERSEMENT_EPARGNE_PERSONNELLE",
                        epargne__isnull=False,
                        tontine__isnull=True,
                        tour__isnull=True,
                    )
                    | models.Q(
                        type_transaction="RETRAIT",
                        tontine__isnull=True,
                        epargne__isnull=True,
                        tour__isnull=True,
                    )
                    | models.Q(
                        type_transaction="DÉPÔT",
                        tontine__isnull=True,
                        epargne__isnull=True,
                        tour__isnull=True,
                    )
                    | models.Q(
                        type_transaction="DÉBIT",
                        tontine__isnull=False,
                        tour__isnull=False,
                        epargne__isnull=True,
                    )
                ),
                name="wallet_transaction_fk_coherence_type",
            ),

        ]

    def clean(self):
        super().clean()
        tt = self.type_transaction
        T = self.TYPE_TRANSACTION

        if self.tour_id and not self.tontine_id:
            raise ValidationError(
                {"tontine": _("Une transaction liée à un tour doit indiquer la tontine.")}
            )

        if self.tour_id and self.tontine_id:
            tour = self.tour
            tontine = self.tontine
            if tour is not None and tontine is not None and tour.tontine_id != tontine.id:
                raise ValidationError(
                    {"tour": _("Le tour doit appartenir à la tontine indiquée.")}
                )

        if tt == T.VERSEMENT_EPARGNE_PERSONNELLE:
            if not self.epargne_id:
                raise ValidationError(
                    {"epargne": _("Un versement épargne doit référencer un projet d’épargne.")}
                )
            if self.tontine_id or self.tour_id:
                raise ValidationError(
                    _("Un versement épargne ne doit pas être lié à une tontine ni à un tour.")
                )
            if self.wallet_id and self.epargne_id:
                w_user = self.wallet.user_id
                e_user = self.epargne.hote_id
                if w_user != e_user:
                    raise ValidationError(
                        {"epargne": _("L’épargne doit appartenir au même utilisateur que le wallet.")}
                    )

        elif tt in (T.RETRAIT, T.DEPOT):
            if self.tontine_id or self.epargne_id or self.tour_id:
                raise ValidationError(
                    _("Un retrait ou un dépôt ne doit pas référencer de tontine, épargne ni tour.")
                )

        elif tt == T.DEBIT:
            if not self.tontine_id or not self.tour_id:
                raise ValidationError(
                    {
                        "tontine": _("Un débit doit référencer la tontine et le tour concernés."),
                        "tour": _("Un débit doit référencer la tontine et le tour concernés."),
                    }
                )
            if self.epargne_id:
                raise ValidationError(
                    {"epargne": _("Un débit ne doit pas référencer l’épargne personnelle.")}
                )

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)
