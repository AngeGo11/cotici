"""Rôles et permissions du back-office administrateur.

Le modèle de permissions est volontairement statique et explicite (pas de
permissions dynamiques en base) : chaque rôle possède un ensemble figé de
codes de permission, définis ci-dessous. Toute évolution du périmètre d'un
rôle doit passer par une revue de code (et non par une configuration runtime),
ce qui est la garantie la plus simple contre une élévation de privilèges
silencieuse sur un périmètre aussi sensible.
"""
from __future__ import annotations

from django.db import models
from django.utils.translation import gettext_lazy as _


class StaffRole(models.TextChoices):
    """Rôles disponibles pour un membre du staff (`StaffProfile.role`)."""

    SUPER_ADMIN = "super_admin", _("Super administrateur")
    OPERATEUR = "operateur", _("Opérateur")
    SUPPORT = "support", _("Support")
    AUDITEUR = "auditeur", _("Auditeur")
    COMPLIANCE = "compliance", _("Conformité")


class Perm:
    """Codes de permission stables (utilisés dans ROLE_PERMISSIONS, les vues
    et les tests). Ne jamais renommer un code existant : préférer en ajouter
    un nouveau et déprécier l'ancien, pour ne pas casser les tests/matrices
    de permissions déjà écrits.
    """

    USER_READ = "user.read"
    USER_SUSPEND = "user.suspend"
    USER_PII_REVEAL = "user.pii_reveal"

    KYC_REVIEW = "kyc.review"
    KYC_APPROVE = "kyc.approve"

    WALLET_READ = "wallet.read"
    WALLET_ADJUST = "wallet.adjust"

    TX_READ = "tx.read"
    TX_FORCE_STATUS = "tx.force_status"

    TONTINE_READ = "tontine.read"
    TONTINE_MODERATE = "tontine.moderate"

    CAGNOTTE_READ = "cagnotte.read"
    CAGNOTTE_MODERATE = "cagnotte.moderate"

    DISPUTE_READ = "dispute.read"
    DISPUTE_RESOLVE = "dispute.resolve"

    AUDIT_READ = "audit.read"

    STAFF_MANAGE = "staff.manage"
    SETTINGS_WRITE = "settings.write"

    @classmethod
    def all(cls) -> frozenset[str]:
        return frozenset(
            value
            for name, value in vars(cls).items()
            if name.isupper() and isinstance(value, str)
        )


# Permissions strictement en lecture : ce sont les seules accordées au rôle
# "auditeur" (voir contrainte métier : auditeur = uniquement les *.read).
READ_ONLY_PERMS: frozenset[str] = frozenset(
    {
        Perm.USER_READ,
        Perm.WALLET_READ,
        Perm.TX_READ,
        Perm.TONTINE_READ,
        Perm.CAGNOTTE_READ,
        Perm.DISPUTE_READ,
        Perm.AUDIT_READ,
    }
)

# Un rôle ne peut détenir QUE des permissions listées dans Perm.all() ; ceci
# est vérifié par les tests (test_roles_matrix.py) pour éviter toute faute de
# frappe silencieuse dans un code de permission.
ROLE_PERMISSIONS: dict[str, frozenset[str]] = {
    StaffRole.SUPER_ADMIN: Perm.all(),
    StaffRole.OPERATEUR: frozenset(
        {
            Perm.USER_READ,
            Perm.USER_SUSPEND,
            Perm.KYC_REVIEW,
            Perm.KYC_APPROVE,
            Perm.WALLET_READ,
            Perm.TX_READ,
            Perm.TONTINE_READ,
            Perm.TONTINE_MODERATE,
            Perm.CAGNOTTE_READ,
            Perm.CAGNOTTE_MODERATE,
            Perm.DISPUTE_READ,
            Perm.DISPUTE_RESOLVE,
            Perm.AUDIT_READ,
        }
    ),
    StaffRole.SUPPORT: frozenset(
        {
            Perm.USER_READ,
            Perm.WALLET_READ,
            Perm.TX_READ,
            Perm.TONTINE_READ,
            Perm.CAGNOTTE_READ,
            Perm.DISPUTE_READ,
            Perm.AUDIT_READ,
        }
    ),
    StaffRole.AUDITEUR: READ_ONLY_PERMS,
    StaffRole.COMPLIANCE: frozenset(
        {
            Perm.USER_READ,
            Perm.USER_PII_REVEAL,
            Perm.KYC_REVIEW,
            Perm.KYC_APPROVE,
            Perm.WALLET_READ,
            Perm.TX_READ,
            Perm.DISPUTE_READ,
            Perm.DISPUTE_RESOLVE,
            Perm.AUDIT_READ,
        }
    ),
}


def has_perm(role: str | None, perm: str) -> bool:
    """Retourne True si le rôle donné détient la permission `perm`.

    Toujours False pour un rôle inconnu/None : "fail closed" par défaut.
    """
    if not role:
        return False
    return perm in ROLE_PERMISSIONS.get(role, frozenset())


def permissions_for_role(role: str | None) -> frozenset[str]:
    """Permissions effectives d'un rôle ; ensemble vide si rôle inconnu."""
    if not role:
        return frozenset()
    return ROLE_PERMISSIONS.get(role, frozenset())
