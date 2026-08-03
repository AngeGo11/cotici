"""Domaine de la vérification d'identité (KYC).

Choix structurants, à connaître avant de modifier ce module :

1. **Un dossier est un événement, pas un état du client.** Chaque soumission
   crée une ligne : un rejet suivi d'une nouvelle tentative doit rester
   lisible dans l'historique. Le "niveau vérifié" d'un client se déduit de ses
   dossiers approuvés (`niveau_verifie_pour`), il n'est jamais dupliqué sur le
   `User` — un champ dénormalisé finirait par diverger de la file d'examen.

2. **Les pièces justificatives ne sont jamais servies en statique.** Elles
   sont écrites sous `MEDIA_ROOT/kyc/`, hors de tout répertoire exposé par le
   serveur web, et ne sont lisibles que via l'endpoint back-office qui vérifie
   la permission et journalise l'accès. Publier ces fichiers derrière une URL
   devinable équivaudrait à publier les pièces d'identité des clients.

3. **Une décision est définitive.** Une fois approuvé ou rejeté, un dossier ne
   change plus d'état : le client resoumet un nouveau dossier. C'est ce qui
   rend le journal opposable — sans cela, une approbation pourrait être
   réécrite après coup sans trace.
"""
from __future__ import annotations

import uuid

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _


def kyc_document_path(instance, filename: str) -> str:
    """Chemin de stockage d'une pièce.

    Le nom d'origine du fichier est jeté au profit d'un UUID : un nom fourni
    par le client est à la fois une donnée personnelle ("cni-kouassi.jpg") et
    un vecteur de traversée de répertoire.
    """
    extension = (filename.rsplit(".", 1)[-1] if "." in filename else "bin").lower()[:8]
    return f"kyc/{instance.dossier_id}/{uuid.uuid4().hex}.{extension}"


class KycSubmission(models.Model):
    """Dossier de vérification d'identité soumis par un utilisateur."""

    class Niveau(models.TextChoices):
        """Paliers de vérification.

        Le montant plafond associé à chaque palier n'est volontairement pas
        stocké ici : il relève des réglages plateforme, pas du dossier.
        """

        NIVEAU_1 = "NIVEAU_1", _("Niveau 1 — identité déclarée")
        NIVEAU_2 = "NIVEAU_2", _("Niveau 2 — pièce officielle vérifiée")
        NIVEAU_3 = "NIVEAU_3", _("Niveau 3 — vérification renforcée")

    class TypePiece(models.TextChoices):
        CNI = "CNI", _("Carte nationale d'identité")
        PASSEPORT = "PASSEPORT", _("Passeport")
        PERMIS = "PERMIS", _("Permis de conduire")
        ATTESTATION = "ATTESTATION", _("Attestation d'identité")

    class Statut(models.TextChoices):
        EN_ATTENTE = "EN_ATTENTE", _("En attente d'examen")
        EN_EXAMEN = "EN_EXAMEN", _("En cours d'examen")
        APPROUVE = "APPROUVE", _("Approuvé")
        REJETE = "REJETE", _("Rejeté")

    #: Statuts terminaux : plus aucune décision n'est acceptée ensuite.
    STATUTS_DECIDES = (Statut.APPROUVE, Statut.REJETE)

    dossier_id = models.UUIDField(
        default=uuid.uuid4,
        editable=False,
        unique=True,
        verbose_name=_("Identifiant du dossier"),
        help_text=_(
            "Identifiant non séquentiel, utilisé dans le chemin de stockage des "
            "pièces pour qu'aucune URL ne soit devinable par incrémentation."
        ),
    )
    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="dossiers_kyc",
        verbose_name=_("Utilisateur"),
    )
    niveau_demande = models.CharField(
        max_length=16,
        choices=Niveau.choices,
        default=Niveau.NIVEAU_2,
        verbose_name=_("Niveau demandé"),
    )

    type_piece = models.CharField(
        max_length=16, choices=TypePiece.choices, verbose_name=_("Type de pièce")
    )
    numero_piece = models.CharField(max_length=64, verbose_name=_("Numéro de pièce"))
    date_expiration_piece = models.DateField(
        null=True, blank=True, verbose_name=_("Expiration de la pièce")
    )
    nom_declare = models.CharField(max_length=150, blank=True, default="")
    prenoms_declares = models.CharField(max_length=150, blank=True, default="")
    date_naissance = models.DateField(null=True, blank=True)

    document_recto = models.FileField(
        upload_to=kyc_document_path, verbose_name=_("Pièce — recto")
    )
    document_verso = models.FileField(
        upload_to=kyc_document_path, blank=True, verbose_name=_("Pièce — verso")
    )
    selfie = models.FileField(
        upload_to=kyc_document_path, blank=True, verbose_name=_("Photo du porteur")
    )

    statut = models.CharField(
        max_length=16,
        choices=Statut.choices,
        default=Statut.EN_ATTENTE,
        verbose_name=_("Statut"),
    )
    motif_decision = models.TextField(
        blank=True,
        default="",
        verbose_name=_("Motif de la décision"),
        help_text=_("Obligatoire pour un rejet ; conservé pour l'opposabilité."),
    )
    decide_par = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="dossiers_kyc_decides",
        verbose_name=_("Décidé par"),
    )
    niveau_accorde = models.CharField(
        max_length=16,
        choices=Niveau.choices,
        blank=True,
        default="",
        verbose_name=_("Niveau accordé"),
        help_text=_(
            "Peut être inférieur au niveau demandé : un dossier incomplet peut "
            "justifier d'accorder un palier plus bas plutôt que de tout rejeter."
        ),
    )

    date_soumission = models.DateTimeField(auto_now_add=True)
    date_decision = models.DateTimeField(null=True, blank=True)

    class Meta:
        verbose_name = _("Dossier KYC")
        verbose_name_plural = _("Dossiers KYC")
        ordering = ["date_soumission"]
        indexes = [
            # La file d'examen se lit toujours "en attente, du plus ancien au
            # plus récent" : c'est la requête à indexer.
            models.Index(fields=["statut", "date_soumission"]),
            models.Index(fields=["user", "-date_soumission"]),
        ]
        constraints = [
            # Un dossier décidé sans date ni décideur rendrait le journal
            # inexploitable : on l'interdit en base, pas seulement en Python.
            models.CheckConstraint(
                check=(
                    ~models.Q(statut__in=["APPROUVE", "REJETE"])
                    | models.Q(date_decision__isnull=False, decide_par__isnull=False)
                ),
                name="kyc_decision_horodatee_et_imputable",
            ),
            # Un rejet sans motif n'est pas contestable par le client.
            models.CheckConstraint(
                check=~models.Q(statut="REJETE") | ~models.Q(motif_decision=""),
                name="kyc_rejet_motive",
            ),
            # Une approbation doit dire quel palier est accordé.
            models.CheckConstraint(
                check=~models.Q(statut="APPROUVE") | ~models.Q(niveau_accorde=""),
                name="kyc_approbation_precise_le_niveau",
            ),
        ]

    def __str__(self) -> str:
        return f"KYC {self.dossier_id} — {self.get_statut_display()}"

    @property
    def est_decide(self) -> bool:
        return self.statut in self.STATUTS_DECIDES
