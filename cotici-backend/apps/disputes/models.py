"""Domaine "Litiges" (réclamations client).

Ce module n'existait pas avant la création de cette app : aucune donnée n'est
encore alimentée par l'application mobile (à venir). Le back-office expose
dès maintenant le domaine complet (liste, détail, résolution) pour préparer
ce futur flux — même approche que le module KYC équivalent.

Un litige est ouvert par un utilisateur (client final), optionnellement
rattaché à une transaction wallet contestée ou à une tontine (cotisation non
créditée, conflit entre membres...). Il traverse un petit automate d'état
(`Dispute.Status`) jusqu'à sa résolution par un membre du staff.

IMPORTANT — périmètre volontairement limité : la résolution d'un litige ne
touche JAMAIS aux soldes ni aux transactions. Un éventuel remboursement/
ajustement financier consécutif à un litige relève exclusivement du module
`apps.wallet` (ajustement de solde par le staff habilité), pas de ce module.
"""
from __future__ import annotations

from django.conf import settings
from django.db import models
from django.db.models import F, Q
from django.utils.translation import gettext_lazy as _


class Dispute(models.Model):
    """Un litige ouvert par un utilisateur de la plateforme."""

    class Category(models.TextChoices):
        """Catégorie du litige : détermine le contexte affiché au staff."""

        TRANSACTION_CONTESTED = "transaction_contestee", _("Transaction contestée")
        CONTRIBUTION_NOT_CREDITED = "cotisation_non_creditee", _("Cotisation non créditée")
        MEMBER_CONFLICT = "litige_entre_membres", _("Litige entre membres")
        OTHER = "autre", _("Autre")

    class Status(models.TextChoices):
        """Cycle de vie du litige.

        `OPEN` -> `IN_REVIEW` -> (`RESOLVED` | `REJECTED`). Aucune transition
        n'est possible depuis un état terminal (`RESOLVED`/`REJECTED`) : voir
        `apps.administration.services.dispute_admin_service.resolve_dispute`.
        """

        OPEN = "ouvert", _("Ouvert")
        IN_REVIEW = "en_cours_examen", _("En cours d'examen")
        RESOLVED = "resolu", _("Résolu")
        REJECTED = "rejete", _("Rejeté")

    #: États dans lesquels un litige n'est pas encore tranché.
    OPEN_STATUSES = (Status.OPEN, Status.IN_REVIEW)
    #: États terminaux : plus aucune transition n'est permise depuis ceux-ci.
    TERMINAL_STATUSES = (Status.RESOLVED, Status.REJECTED)

    # --- Ouverture du litige ---------------------------------------------
    opened_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="disputes_opened",
        verbose_name=_("Ouvert par"),
        help_text=_(
            "Utilisateur (client final) à l'origine du litige. SET_NULL (et non "
            "CASCADE) : un litige doit survivre à la suppression du compte qui "
            "l'a ouvert, pour rester consultable dans l'historique."
        ),
    )

    # Rattachement optionnel au contexte métier contesté. Un litige peut ne
    # référencer ni l'un ni l'autre (catégorie OTHER, ex : litige hors
    # plateforme relayé par le support).
    transaction = models.ForeignKey(
        "wallet.Transaction",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="disputes",
        verbose_name=_("Transaction contestée"),
        help_text=_(
            "SET_NULL : la transaction peut en théorie être purgée sans "
            "emporter la trace du litige qui la concernait."
        ),
    )
    tontine = models.ForeignKey(
        "tontine.Tontine",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="disputes",
        verbose_name=_("Tontine concernée"),
    )

    category = models.CharField(
        max_length=32,
        choices=Category.choices,
        verbose_name=_("Catégorie"),
    )
    subject = models.CharField(
        max_length=255,
        verbose_name=_("Objet"),
        help_text=_("Résumé court affiché en liste."),
    )
    description = models.TextField(
        verbose_name=_("Description"),
        help_text=_("Détail de la réclamation tel que rapporté par l'utilisateur."),
    )

    # --- Statut et cycle de vie -------------------------------------------
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.OPEN,
        verbose_name=_("Statut"),
    )
    opened_at = models.DateTimeField(auto_now_add=True, verbose_name=_("Date d'ouverture"))
    updated_at = models.DateTimeField(auto_now=True)

    # --- Résolution ---------------------------------------------------------
    resolved_at = models.DateTimeField(null=True, blank=True, verbose_name=_("Date de résolution"))
    decision = models.TextField(
        blank=True,
        default="",
        verbose_name=_("Décision"),
        help_text=_("Verdict rendu par le staff (résolu/rejeté) : obligatoire à la résolution."),
    )
    resolution_reason = models.TextField(
        blank=True,
        default="",
        verbose_name=_("Motif"),
        help_text=_(
            "Motif de la décision, dupliqué depuis le journal d'audit "
            "(AdminActionLog) pour rester lisible directement sur le litige."
        ),
    )
    resolved_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="disputes_resolved",
        verbose_name=_("Résolu par"),
        help_text=_("Membre du staff ayant tranché le litige — imputabilité de la décision."),
    )

    class Meta:
        verbose_name = _("Litige")
        verbose_name_plural = _("Litiges")
        ordering = ["opened_at"]
        indexes = [
            models.Index(fields=["status", "opened_at"]),
            models.Index(fields=["category"]),
        ]
        constraints = [
            # Un litige résolu/rejeté DOIT porter une date de résolution et un
            # décideur ; un litige encore ouvert/en examen ne doit en avoir
            # aucun. Empêche un état bâtard (ex : "résolu" sans personne
            # responsable de la décision).
            #
            # NB : les valeurs de statut sont dupliquées en littéraux ("ouvert"
            # etc.) plutôt que référencées via `Status.OPEN` : à l'intérieur du
            # corps de `Meta` (classe imbriquée), le nom `Status` défini au
            # niveau de `Dispute` n'est pas visible (portée lexicale des
            # classes Python, pas de nesting comme pour les fonctions).
            models.CheckConstraint(
                check=(
                    Q(
                        status__in=["ouvert", "en_cours_examen"],
                        resolved_at__isnull=True,
                        resolved_by__isnull=True,
                    )
                    | Q(
                        status__in=["resolu", "rejete"],
                        resolved_at__isnull=False,
                        resolved_by__isnull=False,
                    )
                ),
                name="dispute_resolution_fields_consistent_with_status",
            ),
            # Piège évité : une résolution horodatée avant l'ouverture (bug de
            # rejeu, correction manuelle malencontreuse en base).
            models.CheckConstraint(
                check=Q(resolved_at__isnull=True) | Q(resolved_at__gte=F("opened_at")),
                name="dispute_resolved_at_after_opened_at",
            ),
            # Une décision doit être motivée par du texte, pas juste par un
            # changement de statut silencieux.
            models.CheckConstraint(
                check=Q(status__in=["ouvert", "en_cours_examen"]) | ~Q(decision=""),
                name="dispute_resolved_requires_decision",
            ),
        ]

    def __str__(self) -> str:
        return f"Litige #{self.pk} [{self.get_status_display()}] {self.subject}"

    @property
    def is_terminal(self) -> bool:
        return self.status in self.TERMINAL_STATUSES
