from django.apps import AppConfig


class KycConfig(AppConfig):
    """Vérification d'identité (KYC).

    L'app ne porte que le domaine et son stockage : les écrans d'examen sont
    exposés par `apps.administration` (`/api/admin/kyc/`), et la soumission
    des dossiers par l'application mobile viendra s'ajouter ici.
    """

    default_auto_field = "django.db.models.BigAutoField"
    name = "apps.kyc"
    verbose_name = "Vérification d'identité"
