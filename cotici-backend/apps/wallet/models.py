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

    class Meta:
        constraints = [
            # Defense in depth : le solde ne doit jamais devenir négatif, même si un
            # futur appelant (script, admin, bug applicatif) contourne les contrôles
            # de withdrawal()/cotiser_tontine().
            models.CheckConstraint(
                check=models.Q(solde_courant__gte=0),
                name="wallet_solde_courant_non_negatif",
            ),
        ]


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
        RETRAIT_EPARGNE_PERSONNELLE = "RETRAIT_EPARGNE_PERSONNELLE", _("Retrait épargne personnelle")
        DEBIT = "DÉBIT", _("Débit")
        CONTRIBUTION_SOLIDAIRE = "CONTRIBUTION_SOLIDAIRE", _("Contribution solidaire")
        VERSEMENT_SOLIDAIRE = "VERSEMENT_SOLIDAIRE", _("Versement solidaire")
        VALIDATION_VERSEMENT_SOLIDAIRE = (
            "VALIDATION_VERSEMENT_SOLIDAIRE",
            _("Validation versement solidaire"),
        )
        CONTRIBUTION_CAGNOTTE = "CONTRIBUTION_CAGNOTTE", _("Contribution cagnotte")
        VERSEMENT_CAGNOTTE = "VERSEMENT_CAGNOTTE", _("Versement cagnotte")
        # ATTENTION (piège documenté) : tout nouveau type de transaction doit être
        # ajouté SIMULTANÉMENT (a) ici, (b) dans `clean()` ci-dessous, (c) dans la
        # CheckConstraint `wallet_transaction_fk_coherence_type` — sinon `full_clean()`
        # (appelé par `save()`) fait échouer TOUTE tentative de sauvegarde de ce type.
        PENALITE = "PENALITE", _("Pénalité de retard")
        VERSEMENT_PENALITE = "VERSEMENT_PENALITE", _("Versement pénalité")

    # Clé étrangère
    tontine = models.ForeignKey(Tontine, on_delete=models.CASCADE, null=True, blank=True)
    epargne = models.ForeignKey(EpargnePersonnelle, on_delete=models.CASCADE, null=True, blank=True)
    wallet = models.ForeignKey(Wallet, on_delete=models.CASCADE)
    tour = models.ForeignKey(TourTontine, on_delete=models.CASCADE, null=True, blank=True)
    solde_courant = models.DecimalField(max_digits=10, decimal_places=0)
    ref_transaction = models.CharField(max_length=25, unique=True)
    # Clé d'idempotence fournie par le client (UUID généré côté mobile), permettant
    # de rejouer une requête (retry réseau, double-tap) sans recréer une opération
    # financière distincte. Nullable/optionnelle pour rester rétrocompatible avec
    # le frontend actuel qui n'envoie pas encore cette clé.
    client_ref = models.CharField(max_length=64, null=True, blank=True)
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
                        type_transaction="RETRAIT_EPARGNE_PERSONNELLE",
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
                    | models.Q(
                        type_transaction="CONTRIBUTION_SOLIDAIRE",
                        tontine__isnull=False,
                        tour__isnull=True,
                        epargne__isnull=True,
                    )
                    | models.Q(
                        type_transaction="VERSEMENT_SOLIDAIRE",
                        tontine__isnull=False,
                        tour__isnull=True,
                        epargne__isnull=True,
                    )
                    | models.Q(
                        type_transaction="VALIDATION_VERSEMENT_SOLIDAIRE",
                        tontine__isnull=False,
                        tour__isnull=True,
                        epargne__isnull=True,
                    )
                    # CONTRIBUTION_CAGNOTTE/VERSEMENT_CAGNOTTE manquaient de cette
                    # contrainte : toute tentative de les utiliser échouait au save()
                    # (full_clean), ce qui avait poussé le code appelant à utiliser
                    # CONTRIBUTION_SOLIDAIRE/VERSEMENT_SOLIDAIRE à la place — cassant
                    # silencieusement le calcul de la collecte cagnotte.
                    | models.Q(
                        type_transaction="CONTRIBUTION_CAGNOTTE",
                        tontine__isnull=False,
                        tour__isnull=True,
                        epargne__isnull=True,
                    )
                    | models.Q(
                        type_transaction="VERSEMENT_CAGNOTTE",
                        tontine__isnull=False,
                        tour__isnull=True,
                        epargne__isnull=True,
                    )
                    # Pénalités automatiques/manuelles de retard (apps.tontine.Penalite) :
                    # débit du fautif (PENALITE) et crédit du bénéficiaire du tour
                    # (VERSEMENT_PENALITE) référencent tous deux tontine ET tour — la
                    # pénalité est toujours rattachée à un tour précis (voir
                    # `apps.tontine.services.penalties_service`).
                    | models.Q(
                        type_transaction="PENALITE",
                        tontine__isnull=False,
                        tour__isnull=False,
                        epargne__isnull=True,
                    )
                    | models.Q(
                        type_transaction="VERSEMENT_PENALITE",
                        tontine__isnull=False,
                        tour__isnull=False,
                        epargne__isnull=True,
                    )
                ),
                name="wallet_transaction_fk_coherence_type",
            ),
            # Filet de sécurité DB contre la double cotisation sur un même tour : le
            # recontrôle applicatif dans cotiser_tontine (sous select_for_update) est
            # la protection principale, cette contrainte est le dernier rempart si un
            # futur appelant contourne la vue (script, admin, autre code path).
            models.UniqueConstraint(
                fields=["tour", "wallet"],
                condition=models.Q(
                    type_transaction="DÉBIT",
                    statut_transaction="RÉUSSIE",
                ),
                name="unique_debit_reussi_par_tour_et_wallet",
            ),
            # Defense in depth DB : un montant de transaction nul/négatif ou un solde
            # après transaction négatif ne devrait jamais pouvoir être enregistré, même
            # via un code path qui contournerait la validation applicative.
            models.CheckConstraint(
                check=models.Q(montant_transaction__gt=0),
                name="transaction_montant_transaction_positif",
            ),
            models.CheckConstraint(
                check=models.Q(solde_courant__gte=0),
                name="transaction_solde_courant_non_negatif",
            ),
            # Idempotence : filet de sécurité DB contre une double écriture pour la
            # même clé client sur le même wallet, en cas de race condition ou de
            # code path contournant le recontrôle applicatif sous select_for_update.
            # Contrainte PARTIELLE (condition client_ref__isnull=False) pour ne pas
            # contraindre les transactions historiques/futures sans clé fournie.
            models.UniqueConstraint(
                fields=["wallet", "client_ref"],
                condition=models.Q(client_ref__isnull=False),
                name="unique_client_ref_par_wallet",
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

        if tt in (T.VERSEMENT_EPARGNE_PERSONNELLE, T.RETRAIT_EPARGNE_PERSONNELLE):
            if not self.epargne_id:
                raise ValidationError(
                    {"epargne": _("Une opération épargne doit référencer un projet d’épargne.")}
                )
            if self.tontine_id or self.tour_id:
                raise ValidationError(
                    _("Une opération épargne ne doit pas être liée à une tontine ni à un tour.")
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

        elif tt in (
            T.CONTRIBUTION_SOLIDAIRE,
            T.VERSEMENT_SOLIDAIRE,
            T.VALIDATION_VERSEMENT_SOLIDAIRE,
        ):
            if not self.tontine_id:
                raise ValidationError(
                    {"tontine": _("Une opération solidaire doit référencer la collecte.")}
                )
            if self.tour_id or self.epargne_id:
                raise ValidationError(
                    _("Une opération solidaire ne doit pas référencer de tour ni d’épargne.")
                )

        elif tt in (T.PENALITE, T.VERSEMENT_PENALITE):
            if not self.tontine_id or not self.tour_id:
                raise ValidationError(
                    {
                        "tontine": _("Une pénalité doit référencer la tontine et le tour concernés."),
                        "tour": _("Une pénalité doit référencer la tontine et le tour concernés."),
                    }
                )
            if self.epargne_id:
                raise ValidationError(
                    {"epargne": _("Une pénalité ne doit pas référencer l’épargne personnelle.")}
                )

    def save(self, *args, **kwargs):
        self.full_clean()
        super().save(*args, **kwargs)
