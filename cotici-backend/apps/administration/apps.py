from django.apps import AppConfig


class AdministrationConfig(AppConfig):
    """Application du back-office administrateur (COTICI).

    Périmètre : authentification staff (session + TOTP obligatoire),
    gestion des rôles/permissions, journal d'audit dédié. Les modules
    métier (KYC, litiges, ajustements wallet, modération...) sont hors
    scope de cette phase 0 (scaffolding sécurité + socle).
    """

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.administration"
    verbose_name = "Back-office administrateur"
