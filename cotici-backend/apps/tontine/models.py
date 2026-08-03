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
        # Clôture FORCÉE à l'échéance (job/tâche de clôture automatique, voir
        # `apps.tontine.services.cloture_service.cloturer_tour_echeance`) alors
        # que certains membres n'ont pas cotisé. Volontairement DISTINCT de
        # TERMINÉ : un tour TERMINÉ normalement est soldé (tout le monde a
        # payé, `montant_depose == montant_attendu`) alors qu'un tour
        # CLOTURE_INCOMPLET a versé un POT PARTIEL au bénéficiaire et laisse
        # derrière lui des `DetteCotisation` impayées — un consommateur de
        # l'API (mobile, back-office) qui confondrait les deux croirait à
        # tort le cycle intégralement soldé.
        CLOTURE_INCOMPLET = "CLÔTURÉ AVEC IMPAYÉS", _("Clôturé avec impayés")


    tontine = models.ForeignKey(Tontine, on_delete=models.CASCADE)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    # Snapshot STRICT des cotisations réellement encaissées sur ce tour
    # (incrémenté uniquement par `cotiser_tontine`, jamais par le versement au
    # bénéficiaire ni par un règlement de pénalité/dette — voir la note dans
    # `apps.tontine.services.penalties_service._executer_prelevement`). C'est
    # donc, par construction, le montant du POT PARTIEL en cas de clôture avec
    # impayés : ne JAMAIS réutiliser ce champ pour autre chose.
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

    # --- Pot partiel (clôture avec impayés) --------------------------------
    # Les trois champs suivants restent à `0` pour un tour TERMINÉ normalement
    # (tout le monde a cotisé) : ils ne sont renseignés que par
    # `cloturer_tour_echeance` lorsqu'une clôture forcée intervient à
    # échéance avec des impayés. Décomposés en trois montants distincts (plutôt
    # que de détourner `montant_depose`) pour que la trace comptable du
    # versement reste intégralement reconstituable a posteriori : combien
    # était théoriquement attendu, combien a réellement été retenu au titre
    # d'une compensation, et combien a in fine été crédité au bénéficiaire.
    montant_attendu = models.DecimalField(
        max_digits=10,
        decimal_places=0,
        default=0,
        help_text=(
            "Montant théorique attendu pour ce tour (montant_cotisation × "
            "nombre_max de la règle), snapshotté à la clôture — permet de "
            "calculer le taux de collecte du pot partiel sans dépendre de la "
            "règle courante, qui peut évoluer après coup."
        ),
    )
    montant_compense_beneficiaire = models.DecimalField(
        max_digits=10,
        decimal_places=0,
        default=0,
        help_text=(
            "Montant retenu sur le pot AVANT versement au bénéficiaire, au "
            "titre de sa propre dette (cotisation manquée à son propre tour "
            "+ pénalité éventuelle) — voir règle métier de compensation du "
            "bénéficiaire. Toujours 0 si le bénéficiaire a lui-même cotisé."
        ),
    )
    montant_verse_beneficiaire = models.DecimalField(
        max_digits=10,
        decimal_places=0,
        default=0,
        help_text=(
            "Montant NET effectivement crédité au wallet du bénéficiaire "
            "(= montant_depose − montant_compense_beneficiaire, plancher à "
            "0F : jamais de versement négatif). Pour un tour clôturé "
            "normalement (TERMINÉ), égal à montant_depose."
        ),
    )

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
            models.CheckConstraint(
                check=models.Q(montant_attendu__gte=0),
                name="tourtontine_montant_attendu_non_negatif",
            ),
            models.CheckConstraint(
                check=models.Q(montant_compense_beneficiaire__gte=0),
                name="tourtontine_montant_compense_non_negatif",
            ),
            # Jamais de versement négatif au bénéficiaire : un pot net
            # "négatif" (compensation supérieure au pot collecté) est
            # PLAFONNÉ à 0 côté service (`cloturer_tour_echeance`), jamais
            # persisté en négatif — voir sa docstring pour la décision produit
            # sur le sort du solde de compensation non couvert.
            models.CheckConstraint(
                check=models.Q(montant_verse_beneficiaire__gte=0),
                name="tourtontine_montant_verse_beneficiaire_non_negatif",
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


class DetteCotisation(models.Model):
    """Dette de COTISATION MANQUÉE, distincte d'une `Penalite`.

    Une pénalité (`Penalite`) est une sanction : son montant est fixé par
    `TontineRegle.montant_penalite` et sa vocation est punitive. Une
    `DetteCotisation` n'est PAS une sanction : c'est la simple constatation
    qu'un membre n'a pas versé la mise qu'il devait à un tour donné, avant
    que ce tour n'ait été clôturé de force à échéance (voir
    `apps.tontine.services.cloture_service.cloturer_tour_echeance`). Les deux
    natures ont un créancier différent :
    - une `Penalite` créditait déjà historiquement le bénéficiaire du tour
      (voir `apps.tontine.services.penalties_service`, destination
      paramétrable — en cours d'arbitrage métier) ;
    - une `DetteCotisation` a TOUJOURS pour créancier le bénéficiaire LÉSÉ du
      tour concerné (`beneficiaire_lese`) : c'est lui, et lui seul, qui a reçu
      un pot partiel amputé de cette cotisation manquante, et c'est donc lui
      qui doit être remboursé quand le débiteur régularise — potentiellement
      plusieurs tours plus tard, alors qu'un autre membre est entre-temps
      devenu bénéficiaire courant (d'où l'absence de toute notion de "tour
      courant" dans le règlement de cette dette).

    Ne JAMAIS fusionner ce modèle avec `Penalite` : un débiteur peut devoir
    simultanément une `DetteCotisation` (rembourser SA mise au bénéficiaire
    lésé) ET une `Penalite` (payer une sanction, destination paramétrable)
    pour le même tour manqué — deux écritures comptables distinctes, deux
    créanciers potentiellement différents.
    """

    tontine = models.ForeignKey(Tontine, on_delete=models.CASCADE, related_name="dettes_cotisation")
    # Tour dont la cotisation a été manquée (PROTECT : une dette ne doit
    # jamais se retrouver orpheline d'un tour, sa traçabilité comptable en
    # dépend entièrement — même logique que `Penalite.tour`).
    tour = models.ForeignKey(
        TourTontine, on_delete=models.PROTECT, related_name="dettes_cotisation"
    )
    debiteur = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name="dettes_cotisation_dues",
        help_text="Membre qui n'a pas cotisé à `tour`.",
    )
    # Créancier NOMMÉ, dénormalisé et FIGÉ au moment du constat (copié depuis
    # `tour.user`, jamais relu dynamiquement) : le bénéficiaire peut ensuite
    # quitter la tontine ou changer de statut, la créance reste attachée à
    # LUI. PROTECT (et non CASCADE) : si cet utilisateur devait un jour être
    # supprimé, la dette ne doit pas disparaître silencieusement avec sa
    # créance — un cas qui doit être traité explicitement par un
    # administrateur, pas par un ON DELETE implicite qui effacerait une
    # créance financière encore due.
    beneficiaire_lese = models.ForeignKey(
        User, on_delete=models.PROTECT, related_name="dettes_cotisation_a_recevoir",
        help_text="Bénéficiaire du tour manqué au moment du constat : créancier figé de cette dette.",
    )
    montant_initial = models.DecimalField(
        max_digits=10, decimal_places=0,
        help_text="Montant de la cotisation manquée au moment du constat (= montant_cotisation de la règle à cette date).",
    )
    montant_du = models.DecimalField(
        max_digits=10, decimal_places=0,
        help_text="Solde restant dû. Le règlement est tout-ou-rien (jamais fractionnaire) : passe directement à 0.",
    )
    est_reglee = models.BooleanField(default=False)
    date_reglement = models.DateTimeField(null=True, blank=True)
    # Même sémantique de traçabilité que `Penalite.est_annulee` : une dette
    # annulée par erreur d'attribution n'est jamais supprimée physiquement.
    est_annulee = models.BooleanField(default=False)
    date_annulation = models.DateTimeField(null=True, blank=True)
    # Traçabilité du règlement (débit réel via `apps.tontine.services.dette_service`,
    # unique chemin de débit — voir sa docstring de module) — pas de FK vers
    # `Transaction`, même choix que `Penalite.ref_transaction_reglement`.
    ref_transaction_reglement = models.CharField(max_length=25, blank=True, default="")
    motif = models.CharField(max_length=255, blank=True, default="")
    date_constat = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            models.CheckConstraint(
                check=models.Q(montant_initial__gt=0),
                name="dette_montant_initial_positif",
            ),
            models.CheckConstraint(
                check=models.Q(montant_du__gte=0),
                name="dette_montant_du_non_negatif",
            ),
            # Un débiteur ne peut manquer sa cotisation qu'UNE fois par tour :
            # un seul montant dû par (tour, debiteur) — les tentatives
            # répétées de constat (ex. double invocation de la tâche de
            # clôture) doivent être idempotentes, jamais cumulatives.
            models.UniqueConstraint(
                fields=["tour", "debiteur"],
                name="uniq_dette_cotisation_par_tour_et_debiteur",
            ),
            # Même garde que `Penalite.penalite_reglee_xor_annulee` : une dette
            # ne peut pas être à la fois réglée ET annulée.
            models.CheckConstraint(
                check=~(models.Q(est_reglee=True) & models.Q(est_annulee=True)),
                name="dette_reglee_xor_annulee",
            ),
            # Une dette réglée solde intégralement son montant_du (jamais un
            # règlement partiel silencieux : `dette_service` doit soit régler
            # en totalité, soit laisser `montant_du` positif et `est_reglee=False`).
            models.CheckConstraint(
                check=~models.Q(est_reglee=True, montant_du__gt=0),
                name="dette_reglee_exige_montant_du_nul",
            ),
        ]
        indexes = [
            # Sert le calcul de compensation à la clôture d'un tour dont le
            # bénéficiaire est lui-même débiteur ailleurs (`cloturer_tour_echeance`),
            # `plafond_dette_atteint` et l'agrégat "mes dettes en cours" côté API.
            models.Index(
                fields=["debiteur", "date_constat"],
                name="idx_dette_impayee_par_debiteur",
                condition=models.Q(est_reglee=False, est_annulee=False),
            ),
            # Sert le job de recouvrement (FIFO par bénéficiaire lésé — le
            # plus ancien tour lésé est remboursé en premier) et la liste
            # "créances à recevoir" d'un bénéficiaire côté API.
            models.Index(
                fields=["beneficiaire_lese", "date_constat"],
                name="idx_dette_impayee_par_benef",
                condition=models.Q(est_reglee=False, est_annulee=False),
            ),
        ]

    @property
    def statut(self) -> str:
        """Statut dérivé (jamais stocké), même choix que `Penalite.statut`."""
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
