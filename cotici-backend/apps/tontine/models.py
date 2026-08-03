from __future__ import annotations

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

    class ETAT(models.TextChoices):
        ACTIF = "ACTIF", _("Actif")
        ARCHIVE = "ARCHIVÉ", _("Archivé")
        SUPPRIME = "SUPPRIMÉ", _("Supprimé")

    hote = models.ForeignKey(User, on_delete=models.CASCADE) # Clé étrangère vers user
    type_tontine = models.CharField(choices=TYPE_TONTINE.choices, max_length=50)
    est_active = models.BooleanField(default=True)
    etat = models.CharField(max_length=20, choices=ETAT.choices, default=ETAT.ACTIF)
    date_creation = models.DateTimeField(auto_now_add=True)
    date_archivage = models.DateTimeField(null=True, blank=True)
    date_suppression = models.DateTimeField(null=True, blank=True)
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
    ordre_ramassage = models.IntegerField()  # Ce membre sera le n-ième à être servi
    regles_acceptees = models.BooleanField(default=False)
    date_acceptation_regles = models.DateTimeField(null=True, blank=True)


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

    class ORDRE_RAMASSAGE(models.TextChoices):
        DEFINI_PAR_ADMIN = "DÉFINI PAR L'ADMIN", _("Défini par l'admin")
        ALEATOIRE = "ALÉATOIRE", _("Aléatoire")

    tontine = models.OneToOneField(Tontine, on_delete=models.CASCADE)
    objectif_cotisation = models.DecimalField(
        max_digits=10,
        decimal_places=0,
        help_text="Volume total sur le cycle (dérivé pour les tontines de groupe).",
    )
    montant_cotisation = models.DecimalField(
        max_digits=10,
        decimal_places=0,
        help_text="Mise versée par chaque participant à chaque tour.",
    )
    montant_penalite = models.DecimalField(max_digits=10, decimal_places=0)
    nombre_max = models.IntegerField()
    ordre_ramassage = models.CharField(choices= ORDRE_RAMASSAGE.choices,default=ORDRE_RAMASSAGE.ALEATOIRE, max_length=25)
    frequence = models.CharField(choices= FREQUENCE_COTISATION.choices, max_length=25)
    frequence_personalise = models.IntegerField(blank=True, null=True)
    nombre_tours = models.IntegerField()
    delai_grace_heures = models.PositiveIntegerField(
        default=24,
        help_text="Heures après l'échéance du tour avant constat d'une pénalité (0 = immédiat).",
    )
    # Interrupteur explicite du recouvrement automatique des pénalités de retard
    # (apps.tontine.management.commands.apply_tontine_penalties). JAMAIS activé
    # par une migration de données : une migration qui déclenche des débits
    # financiers est un anti-pattern (rejouée en CI/staging/restore, elle
    # débiterait rétroactivement des wallets). Seul un administrateur, via
    # `modify_tontine_regle`, peut le basculer à True.
    penalites_automatiques = models.BooleanField(default=False)

    class Meta:
        constraints = [
            models.CheckConstraint(
                check=models.Q(montant_cotisation__gt=0),
                name="tontineregle_montant_cotisation_positif",
            ),
            models.CheckConstraint(
                check=models.Q(objectif_cotisation__gt=0),
                name="tontineregle_objectif_cotisation_positif",
            ),
            models.CheckConstraint(
                check=models.Q(montant_penalite__gte=0),
                name="tontineregle_montant_penalite_non_negatif",
            ),
            # 720h = 30 jours : plafond dur pour éviter une règle absurde (grâce
            # infinie de fait) configurée par erreur.
            models.CheckConstraint(
                check=models.Q(delai_grace_heures__lte=720),
                name="tontineregle_delai_grace_max_720h",
            ),
            # Un délai de grâce configuré n'a de sens que si les pénalités
            # automatiques sont activées ET qu'un montant de pénalité positif
            # est défini — sinon le job constaterait des pénalités à 0 F.
            models.CheckConstraint(
                check=models.Q(penalites_automatiques=False) | models.Q(montant_penalite__gt=0),
                name="tontineregle_penalites_auto_exigent_montant",
            ),
        ]



class TourTontine(models.Model):
    class STATUT_TOUR(models.TextChoices):
        EN_COURS="EN COURS", _("En cours")
        TERMINE="TERMINÉ", _("Terminé")
        REPORTE="REPORTÉ", _("Reporté")


    tontine = models.ForeignKey(Tontine, on_delete=models.CASCADE)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    montant_depose = models.DecimalField(max_digits=10, decimal_places=0)
    date = models.DateTimeField(auto_now_add=True)
    numero_du_tour = models.IntegerField()
    statut_tour = models.CharField(choices= STATUT_TOUR.choices, default=STATUT_TOUR.EN_COURS, max_length=25)
    # Cache dérivé de `apps.tontine.scheduling.tour_echeance(regle, tour)`,
    # renseigné à la création du tour (voir apps/tontine/views.py). Sans ce
    # champ matérialisé, aucun job de notification ne peut filtrer les tours
    # à échéance proche en SQL : il faudrait charger tous les tours EN_COURS
    # et recalculer l'échéance en Python pour en jeter la quasi-totalité. Le
    # helper `tour_echeance` reste la source de vérité — en cas de
    # divergence, `recompute_echeances` répare ce cache.
    date_echeance = models.DateTimeField(null=True, blank=True, db_index=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=["tontine", "numero_du_tour"],
                name="uniq_tontine_numero_tour",
            ),
            models.CheckConstraint(
                check=models.Q(montant_depose__gte=0),
                name="tourtontine_montant_depose_non_negatif",
            ),
        ]
        indexes = [
            models.Index(fields=["statut_tour", "date_echeance"]),
        ]



class Penalite(models.Model):

    class TYPE_PENALITE(models.TextChoices):
        RETARD_PAIEMENT = "RETARD PAIEMENT", _("Retard de paiement")
        ABSENCE_PAIEMENT = "ABSENCE PAIEMENT", _("Absence de paiement")


    tontine = models.ForeignKey(Tontine, on_delete=models.CASCADE)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    # Tour à l'origine de la pénalité. Obligatoire pour une pénalité
    # AUTOMATIQUE (voir contrainte `penalite_auto_exige_tour`) : c'est le tour
    # qui détermine le bénéficiaire à créditer (`tour.user`). Nullable pour
    # rester compatible avec les pénalités manuelles historiques, qui ne
    # référencent pas nécessairement de tour précis.
    tour = models.ForeignKey(
        TourTontine, on_delete=models.PROTECT, null=True, blank=True, related_name="penalites"
    )
    montant_penalite = models.DecimalField(max_digits=10, decimal_places=0)
    montant_due = models.DecimalField(max_digits=10, decimal_places=0)
    type_penalite = models.CharField(choices = TYPE_PENALITE.choices, max_length=25)
    est_reglee = models.BooleanField(default=False)
    date_attribution_penalite = models.DateTimeField(auto_now_add=True)
    date_reglement_penalite = models.DateTimeField(auto_now_add=False, null=True, blank=True)
    # Traçabilité : une pénalité attribuée par erreur n'est jamais supprimée
    # physiquement (l'audit `PENALTY_ASSIGNED` la référencerait dans le vide),
    # elle est marquée annulée. `_serialize_penalite` / les listes de pénalités
    # doivent en tenir compte (une pénalité annulée n'est plus "impayée").
    est_annulee = models.BooleanField(default=False)
    date_annulation = models.DateTimeField(null=True, blank=True)
    motif = models.CharField(max_length=255, blank=True, default="")

    # Origine : True si créée par `apply_tontine_penalties` (job de recouvrement
    # automatique), False si attribuée manuellement par un admin/hôte via
    # `attribute_penalite`. Détermine notamment la garde d'unicité par tour
    # (`uniq_penalite_auto_par_tour_et_user`) et l'éligibilité au prélèvement
    # automatique (`tenter_prelevement`).
    est_automatique = models.BooleanField(default=False)
    # Compteurs de la boucle de recouvrement (apps.tontine.services.penalties_service) :
    # incrémentés à chaque tentative de prélèvement, réussie ou non, pour permettre
    # l'anti-thrashing (skip si tentative < 6h) et l'observabilité du job.
    nombre_tentatives = models.PositiveIntegerField(default=0)
    date_derniere_tentative = models.DateTimeField(null=True, blank=True)
    # Référence de la transaction de débit (Transaction.ref_transaction) ayant
    # soldé cette pénalité — traçabilité du règlement, sans FK vers `wallet`
    # (voir la note sur l'absence de FK Transaction -> Penalite plus bas).
    ref_transaction_reglement = models.CharField(max_length=25, blank=True, default="")

    class Meta:
        constraints = [
            # Une pénalité ne peut pas être à la fois réglée ET annulée : ce
            # sont deux issues mutuellement exclusives du cycle de vie.
            models.CheckConstraint(
                check=~(models.Q(est_reglee=True) & models.Q(est_annulee=True)),
                name="penalite_reglee_xor_annulee",
            ),
            models.CheckConstraint(
                check=models.Q(montant_penalite__gte=0) & models.Q(montant_due__gte=0),
                name="penalite_montants_non_negatifs",
            ),
            # Une pénalité automatique DOIT référencer le tour qui l'a déclenchée
            # (nécessaire pour déterminer le bénéficiaire à créditer au règlement).
            models.CheckConstraint(
                check=models.Q(est_automatique=False) | models.Q(tour__isnull=False),
                name="penalite_auto_exige_tour",
            ),
            # Au plus une pénalité AUTOMATIQUE par (tour, user) — volontairement
            # SANS exclure les pénalités annulées (pas de condition
            # `est_annulee=False` ici) : si on excluait les annulées, l'admin qui
            # annule une pénalité automatique par erreur d'attribution verrait le
            # job de constat (apply_tontine_penalties) en recréer une identique
            # au passage suivant, dès lors que le membre est toujours en retard —
            # boucle d'annulation/recréation. En laissant la contrainte porter
            # sur TOUTES les pénalités auto (annulées comprises), une pénalité
            # annulée "consomme" définitivement le slot (tour, user) : c'est un
            # choix produit assumé, pas un oubli.
            models.UniqueConstraint(
                fields=["tour", "user"],
                condition=models.Q(est_automatique=True),
                name="uniq_penalite_auto_par_tour_et_user",
            ),
        ]
        indexes = [
            # Sert `list_my_penalites` (GET penalites/mine/) : toutes les
            # pénalités impayées d'un utilisateur, tontines confondues.
            models.Index(
                fields=["user", "date_attribution_penalite"],
                name="idx_penalite_impayee_par_user",
                condition=models.Q(est_reglee=False, est_annulee=False),
            ),
            # Sert `list_penalites` (filtrée par tontine) et le calcul du
            # plafond de dette (apps.tontine.penalties.plafond_dette_atteint).
            # Nom raccourci par rapport à la spec (`idx_penalite_impayee_par_tontine`,
            # 32 caractères) : Django plafonne les noms d'index à 30 caractères
            # (models.E034), quel que soit le SGBD cible.
            models.Index(
                fields=["tontine", "user"],
                name="idx_penalite_impayee_tontine",
                condition=models.Q(est_reglee=False, est_annulee=False),
            ),
        ]

    @property
    def statut(self) -> str:
        """Statut dérivé (jamais stocké) : `"annulee" | "reglee" | "impayee"`.

        Volontairement une `@property` et non un champ persistant : un champ
        `statut` stocké dupliquerait `est_reglee`/`est_annulee` (déjà exposés au
        contrat mobile existant) et risquerait de diverger d'eux.
        """
        if self.est_annulee:
            return "annulee"
        if self.est_reglee:
            return "reglee"
        return "impayee"


class Chat(models.Model):
    tontine = models.ForeignKey(Tontine, on_delete=models.CASCADE)
    expediteur = models.ForeignKey(User, on_delete=models.CASCADE)
    contenu = models.CharField(max_length=255)
    date = models.DateTimeField(auto_now_add=True)
