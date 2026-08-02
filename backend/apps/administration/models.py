"""Modèles du back-office administrateur.

`StaffProfile` est un OneToOne sur `settings.AUTH_USER_MODEL` : un membre du
staff EST un `User` (authn.User) auquel on greffe un profil staff (rôle,
TOTP...). Les clients mobiles (utilisateurs finaux) n'ont jamais de
`StaffProfile`.
"""
from __future__ import annotations

from django.conf import settings
from django.db import models
from django.utils.translation import gettext_lazy as _

from apps.administration.domain.roles import StaffRole


class StaffProfile(models.Model):
    """Profil staff greffé sur un `User` existant.

    Le secret TOTP (`totp_secret`) n'est JAMAIS exposé via un serializer :
    aucun serializer de ce module ne doit lister ce champ (voir
    `api/serializers/me.py` et `api/serializers/staff.py`).
    """

    user = models.OneToOneField(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name="staff_profile",
        verbose_name=_("Utilisateur"),
    )
    role = models.CharField(
        max_length=32,
        choices=StaffRole.choices,
        verbose_name=_("Rôle"),
    )
    is_active = models.BooleanField(
        default=True,
        verbose_name=_("Actif"),
        help_text=_("Un profil désactivé ne peut plus s'authentifier sur le back-office."),
    )

    # TOTP (RFC 6238). `totp_secret` est stocké en clair au sens Django (pas
    # de hash — un secret TOTP doit être réutilisable pour vérifier un code),
    # mais n'est jamais sérialisé ni loggé.
    totp_secret = models.CharField(max_length=64, blank=True, default="")
    totp_confirmed_at = models.DateTimeField(null=True, blank=True)
    last_totp_counter = models.BigIntegerField(
        null=True,
        blank=True,
        help_text=_("Dernier compteur TOTP (time-step) accepté, pour empêcher le rejeu d'un code."),
    )

    last_login_ip = models.GenericIPAddressField(null=True, blank=True)
    password_changed_at = models.DateTimeField(null=True, blank=True)
    must_change_password = models.BooleanField(default=False)

    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="staff_profiles_created",
        verbose_name=_("Créé par"),
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = _("Profil staff")
        verbose_name_plural = _("Profils staff")

    def __str__(self) -> str:
        return f"{self.user} ({self.get_role_display()})"

    @property
    def totp_is_confirmed(self) -> bool:
        return self.totp_confirmed_at is not None


class StaffLoginAttempt(models.Model):
    """Trace immuable (append-only, en pratique) de chaque tentative de
    connexion au back-office, réussie ou non, à chaque étape (mot de passe
    puis TOTP). Sert à la fois d'historique de sécurité et de base pour le
    throttling par compte/IP.
    """

    class Stage(models.TextChoices):
        PASSWORD = "password", _("Mot de passe")
        TOTP = "totp", _("TOTP")

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="admin_login_attempts",
    )
    username_tried = models.CharField(max_length=150, blank=True, default="")
    ip_address = models.GenericIPAddressField(null=True, blank=True)
    user_agent = models.CharField(max_length=512, blank=True, default="")
    stage = models.CharField(max_length=16, choices=Stage.choices)
    success = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name = _("Tentative de connexion staff")
        verbose_name_plural = _("Tentatives de connexion staff")
        indexes = [
            models.Index(fields=["ip_address", "-created_at"]),
            models.Index(fields=["user", "-created_at"]),
        ]

    def __str__(self) -> str:
        return f"[{self.created_at:%Y-%m-%d %H:%M:%S}] {self.username_tried} ({self.stage}) -> {'OK' if self.success else 'KO'}"


class PlatformSetting(models.Model):
    """Réglage de plateforme unitaire : override en base d'une clé déclarée
    dans `apps.administration.domain.settings_catalog.SETTINGS_CATALOG`.

    Décisions de conception (à justifier ici plutôt que dans une migration
    muette) :

    - `key` est un `CharField` LIBRE (pas de `choices=`) : la liste des clés
      autorisées est portée par le catalogue Python, pas par le schéma. Des
      `choices=` figeraient la liste dans une migration à chaque ajout de
      réglage, alors que le catalogue est conçu pour être étendu par simple
      revue de code côté application — c'est justement le raisonnement
      détaillé dans `domain/settings_catalog`. La liste blanche réelle est
      donc appliquée par `services/settings_service.py`, à l'écriture, et non
      par une contrainte de base de données.
    - Une seule ligne PAR CLÉ (`unique=True`) : ce modèle ne stocke QUE les
      overrides, c'est-à-dire les réglages effectivement modifiés au moins
      une fois. Une base vierge n'a donc aucune ligne, et
      `settings_service.get_all_settings()` complète chaque clé absente avec
      sa valeur par défaut du catalogue — un `GET` renvoie ainsi toujours un
      jeu complet de réglages, y compris juste après une migration.
    - `value` est un `JSONField` : les réglages ont des types hétérogènes
      (montant, entier, booléen), et JSON couvre nativement `bool`/`int`. Les
      montants (type `DECIMAL` au sens du catalogue) sont néanmoins stockés
      comme CHAÎNE JSON (ex. `"1500"`, pas `1500.0`) — jamais comme nombre
      flottant — pour ne jamais transiter par un flottant IEEE-754 et perdre
      en précision : même règle que pour tout montant applicatif
      (`DecimalField`, jamais `float`). La conversion chaîne <-> `Decimal`
      est centralisée dans `services/settings_service.py`.
    - Pas de champ `value_type` en base : le type est une propriété du
      CATALOGUE (donc du code), pas de la donnée — le dupliquer en base
      créerait un risque d'incohérence (une ligne dont le type stocké ne
      correspondrait plus au type déclaré côté catalogue après une évolution
      de ce dernier).
    """

    key = models.CharField(max_length=100, unique=True, verbose_name=_("Clé"))
    value = models.JSONField(verbose_name=_("Valeur"))
    updated_at = models.DateTimeField(auto_now=True, verbose_name=_("Dernière modification"))
    updated_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="platform_settings_updated",
        verbose_name=_("Dernier auteur"),
    )

    class Meta:
        verbose_name = _("Réglage plateforme")
        verbose_name_plural = _("Réglages plateforme")
        ordering = ["key"]

    def __str__(self) -> str:
        return f"{self.key} = {self.value!r}"
