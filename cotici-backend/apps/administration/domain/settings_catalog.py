"""Catalogue déclaratif des réglages plateforme (`PlatformSetting`).

Comme `domain/roles.py` fige la liste des rôles autorisés en Python (plutôt
qu'en base, où n'importe quelle écriture mal maîtrisée pourrait introduire
une valeur non prévue), ce module fige la liste des CLÉS de réglage
autorisées, leur type et leurs bornes. L'API REFUSE toute clé absente de ce
catalogue et toute valeur qui ne respecte pas son type/ses bornes (voir
`services/settings_service.py`) : sans cette liste blanche, n'importe quel
membre du staff disposant de `Perm.SETTINGS_WRITE` pourrait écrire une clé
arbitraire (faute de frappe, clé obsolète, voire clé "magique" lue ailleurs
par erreur) qui ne serait ensuite ni validée ni jamais relue par aucun code
métier — un réglage fantôme, invisible et potentiellement dangereux. Ajouter
ou modifier un réglage nécessite donc une revue de code, au même titre qu'un
rôle ou une permission.

Ce module ne BRANCHE aucun réglage sur le code métier existant (dépôts,
retraits, pénalités de tontine...) : ce branchement est hors périmètre de ce
lot et laissé aux modules concernés. Les valeurs par défaut ci-dessous
reprennent toutefois, quand elles existent, les constantes aujourd'hui
codées en dur (ex. le délai de grâce par défaut d'une tontine, `24` heures,
et son plafond, `720` heures, dans `apps.tontine.serializers`).
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from enum import Enum
from typing import Any

from django.utils.translation import gettext_lazy as _


class SettingType(str, Enum):
    """Types de valeur pris en charge par le catalogue. Le type pilote à la
    fois la conversion JSON -> Python à l'écriture et la validation des
    bornes (`SettingDefinition.min_value` / `max_value`)."""

    INTEGER = "integer"
    DECIMAL = "decimal"
    BOOLEAN = "boolean"


@dataclass(frozen=True)
class SettingDefinition:
    """Définition figée d'un réglage : clé, type, valeur par défaut, bornes
    optionnelles et métadonnées d'affichage (label/description/groupe)."""

    key: str
    label: Any
    description: Any
    value_type: SettingType
    default: Any
    group: str
    min_value: Any = None
    max_value: Any = None


# Délai de grâce par défaut d'une tontine et son plafond : mêmes valeurs que
# les constantes déjà codées en dur dans `apps.tontine.serializers`
# (`delai_grace_heures = 24` par défaut, `DELAI_GRACE_HEURES_MAX = 720`).
# Reprises ici comme VALEURS PAR DÉFAUT du réglage plateforme correspondant —
# le branchement effectif (lire ce réglage plutôt que la constante figée dans
# `apps.tontine`) est hors périmètre de ce lot.
_TONTINE_GRACE_PERIOD_DEFAULT_HOURS = 24
_TONTINE_GRACE_PERIOD_MAX_HOURS = 720


_DEFINITIONS: list[SettingDefinition] = [
    SettingDefinition(
        key="wallet.deposit_min_amount",
        label=_("Montant minimum de dépôt"),
        description=_(
            "Montant minimum (F CFA) autorisé pour un dépôt sur le portefeuille."
        ),
        value_type=SettingType.DECIMAL,
        default=Decimal("100"),
        group="wallet",
        min_value=Decimal("0"),
    ),
    SettingDefinition(
        key="wallet.deposit_max_amount",
        label=_("Montant maximum de dépôt"),
        description=_(
            "Montant maximum (F CFA) autorisé pour un dépôt en une seule transaction."
        ),
        value_type=SettingType.DECIMAL,
        default=Decimal("2000000"),
        group="wallet",
        min_value=Decimal("0"),
    ),
    SettingDefinition(
        key="wallet.withdrawal_min_amount",
        label=_("Montant minimum de retrait"),
        description=_(
            "Montant minimum (F CFA) autorisé pour un retrait du portefeuille."
        ),
        value_type=SettingType.DECIMAL,
        default=Decimal("500"),
        group="wallet",
        min_value=Decimal("0"),
    ),
    SettingDefinition(
        key="wallet.withdrawal_max_amount",
        label=_("Montant maximum de retrait"),
        description=_(
            "Montant maximum (F CFA) autorisé pour un retrait en une seule transaction."
        ),
        value_type=SettingType.DECIMAL,
        default=Decimal("1000000"),
        group="wallet",
        min_value=Decimal("0"),
    ),
    SettingDefinition(
        key="wallet.balance_cap",
        label=_("Plafond de solde"),
        description=_("Solde maximum (F CFA) qu'un portefeuille peut atteindre."),
        value_type=SettingType.DECIMAL,
        default=Decimal("5000000"),
        group="wallet",
        min_value=Decimal("0"),
    ),
    SettingDefinition(
        key="tontine.grace_period_hours",
        label=_("Délai de grâce des cotisations (heures)"),
        description=_(
            "Délai par défaut, en heures, accordé avant qu'une cotisation de "
            "tontine en retard ne soit pénalisée."
        ),
        value_type=SettingType.INTEGER,
        default=_TONTINE_GRACE_PERIOD_DEFAULT_HOURS,
        group="tontine",
        min_value=0,
        max_value=_TONTINE_GRACE_PERIOD_MAX_HOURS,
    ),
    SettingDefinition(
        key="tontine.late_penalty_amount",
        label=_("Montant de la pénalité de retard"),
        description=_(
            "Montant par défaut (F CFA) de la pénalité appliquée en cas de "
            "cotisation de tontine en retard."
        ),
        value_type=SettingType.DECIMAL,
        default=Decimal("500"),
        group="tontine",
        min_value=Decimal("0"),
    ),
    SettingDefinition(
        key="kyc.verification_threshold_amount",
        label=_("Seuil de vérification KYC renforcée"),
        description=_(
            "Montant cumulé (F CFA) au-delà duquel une vérification KYC "
            "renforcée est requise."
        ),
        value_type=SettingType.DECIMAL,
        default=Decimal("500000"),
        group="kyc",
        min_value=Decimal("0"),
    ),
    SettingDefinition(
        key="platform.maintenance_mode",
        label=_("Mode maintenance"),
        description=_(
            "Bascule l'application en mode maintenance : les opérations "
            "financières sont suspendues côté client."
        ),
        value_type=SettingType.BOOLEAN,
        default=False,
        group="platform",
    ),
]

#: Catalogue indexé par clé — SEULE source de vérité des réglages autorisés.
SETTINGS_CATALOG: dict[str, SettingDefinition] = {
    definition.key: definition for definition in _DEFINITIONS
}


def is_known_key(key: str) -> bool:
    """True si `key` fait partie du catalogue autorisé."""
    return key in SETTINGS_CATALOG


def get_definition(key: str) -> SettingDefinition | None:
    """Définition associée à `key`, ou `None` si la clé est inconnue."""
    return SETTINGS_CATALOG.get(key)
