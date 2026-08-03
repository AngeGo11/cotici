"""Exceptions métier du domaine `administration`.

Ces exceptions sont volontairement indépendantes de DRF : la traduction vers
un code HTTP se fait dans la couche API (vues), pas ici.
"""
from __future__ import annotations


class AdministrationError(Exception):
    """Classe de base des erreurs du domaine administration."""


class StaffProfileInactiveError(AdministrationError):
    """Le profil staff existe mais est désactivé."""


class StaffProfileMissingError(AdministrationError):
    """L'utilisateur authentifié n'a pas de `StaffProfile`."""


class SelfModificationForbiddenError(AdministrationError):
    """Un membre du staff ne peut pas modifier son propre profil staff
    (rôle, désactivation...) : évite qu'un compte compromis s'auto-élève ou
    se protège lui-même contre une désactivation légitime."""


class PreAuthExpiredError(AdministrationError):
    """L'état de pré-authentification (entre l'étape mot de passe et l'étape
    TOTP) a expiré ou est invalide."""


class TotpAlreadyConfirmedError(AdministrationError):
    """Tentative de relancer l'enrôlement TOTP alors qu'il est déjà confirmé."""


class TotpNotConfiguredError(AdministrationError):
    """Aucun secret TOTP n'a encore été généré pour ce compte."""


class InvalidTotpCodeError(AdministrationError):
    """Le code TOTP fourni est invalide ou a expiré."""


class ReplayedTotpCodeError(AdministrationError):
    """Le code TOTP fourni a déjà été consommé (anti-rejeu)."""


class InvalidCredentialsError(AdministrationError):
    """Identifiant/mot de passe invalides."""


class InvalidTransactionTransitionError(AdministrationError):
    """Le forçage de statut demandé sur une transaction n'est pas une
    transition défendable (voir `services/transaction_admin_service.force_status`)."""


class WalletInsufficientBalanceError(AdministrationError):
    """Un ajustement manuel de solde wallet (`Perm.WALLET_ADJUST`) rendrait
    le solde négatif : refusé (le solde d'un `Wallet` ne doit jamais
    descendre sous zéro, y compris via une action administrative)."""


class UnknownSettingKeyError(AdministrationError):
    """La clé de réglage fournie n'existe pas dans le catalogue Python
    (`domain/settings_catalog.SETTINGS_CATALOG`) : refusée par construction,
    voir la docstring de ce module pour le raisonnement complet."""


class InvalidSettingValueError(AdministrationError):
    """La valeur fournie pour un réglage ne respecte pas le type ou les
    bornes déclarés pour sa clé dans le catalogue."""
