"""Service métier des réglages plateforme (`PlatformSetting`).

Toute la logique vit ici (pattern "fat model / service layer") :

- lecture : fusion du catalogue Python (`domain/settings_catalog`) avec les
  éventuels overrides en base, pour toujours renvoyer un jeu COMPLET de
  réglages, même sur une base vierge ;
- écriture : validation stricte de chaque clé et valeur par rapport au
  catalogue, sous `transaction.atomic()` avec verrouillage des lignes
  concernées, et calcul du before/after de chaque clé modifiée (consommé par
  la vue pour construire l'entrée d'audit `SETTINGS_CHANGED`).

Les vues ne font que traduire les appels de ce module en réponses HTTP.
"""
from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Any

from django.db import transaction

from apps.administration.domain.errors import (
    InvalidSettingValueError,
    UnknownSettingKeyError,
)
from apps.administration.domain.settings_catalog import (
    SETTINGS_CATALOG,
    SettingDefinition,
    SettingType,
)
from apps.administration.models import PlatformSetting


def _serialize_value(value_type: SettingType, value: Any) -> Any:
    """Convertit une valeur Python native vers sa représentation JSON stable.

    Les montants (`DECIMAL`) sont sérialisés en CHAÎNE (jamais en nombre
    flottant JSON) pour ne jamais perdre en précision — même règle que
    partout ailleurs dans le projet : un montant n'est jamais un `float`.
    """
    if value_type == SettingType.DECIMAL:
        return str(Decimal(value))
    if value_type == SettingType.INTEGER:
        return int(value)
    if value_type == SettingType.BOOLEAN:
        return bool(value)
    raise AssertionError(f"Type de réglage non géré : {value_type}")  # pragma: no cover


def _check_bounds(definition: SettingDefinition, value: Any) -> None:
    if definition.min_value is not None and value < definition.min_value:
        raise InvalidSettingValueError(
            f"« {definition.key} » doit être supérieur ou égal à {definition.min_value}."
        )
    if definition.max_value is not None and value > definition.max_value:
        raise InvalidSettingValueError(
            f"« {definition.key} » doit être inférieur ou égal à {definition.max_value}."
        )


def _parse_and_validate(definition: SettingDefinition, raw_value: Any) -> Any:
    """Convertit `raw_value` (JSON brut reçu du client) vers le type Python
    attendu par `definition` et vérifie ses bornes.

    Lève `InvalidSettingValueError` avec un message explicite en cas
    d'échec — jamais de 500, jamais de valeur silencieusement tronquée ou
    convertie de façon surprenante (ex. `"abc"` pour un entier).
    """
    key = definition.key

    if definition.value_type == SettingType.BOOLEAN:
        if not isinstance(raw_value, bool):
            raise InvalidSettingValueError(f"« {key} » attend un booléen (true/false).")
        return raw_value

    if definition.value_type == SettingType.INTEGER:
        # `bool` est une sous-classe d'`int` en Python : on l'exclut
        # explicitement pour ne pas accepter `true`/`false` comme un entier.
        if isinstance(raw_value, bool) or not isinstance(raw_value, (int, str)):
            raise InvalidSettingValueError(f"« {key} » attend un nombre entier.")
        try:
            parsed_int = int(str(raw_value).strip())
        except (TypeError, ValueError):
            raise InvalidSettingValueError(f"« {key} » attend un nombre entier valide.")
        _check_bounds(definition, parsed_int)
        return parsed_int

    if definition.value_type == SettingType.DECIMAL:
        if isinstance(raw_value, bool) or not isinstance(raw_value, (int, str, float)):
            raise InvalidSettingValueError(f"« {key} » attend un montant numérique.")
        try:
            parsed_decimal = Decimal(str(raw_value).strip())
        except (InvalidOperation, ValueError):
            raise InvalidSettingValueError(f"« {key} » attend un montant décimal valide.")
        _check_bounds(definition, parsed_decimal)
        return parsed_decimal

    raise AssertionError(f"Type de réglage non géré : {definition.value_type}")  # pragma: no cover


def _describe(definition: SettingDefinition, override: PlatformSetting | None) -> dict:
    """Représentation en lecture d'un réglage : fusion de sa définition
    (catalogue) et de son éventuel override en base."""
    if override is not None:
        value = override.value
        updated_at = override.updated_at
        updated_by_username = override.updated_by.username if override.updated_by else None
        is_default = False
    else:
        value = _serialize_value(definition.value_type, definition.default)
        updated_at = None
        updated_by_username = None
        is_default = True

    return {
        "key": definition.key,
        "label": str(definition.label),
        "description": str(definition.description),
        "group": definition.group,
        "value_type": definition.value_type.value,
        "value": value,
        "default_value": _serialize_value(definition.value_type, definition.default),
        "min_value": (
            _serialize_value(definition.value_type, definition.min_value)
            if definition.min_value is not None
            else None
        ),
        "max_value": (
            _serialize_value(definition.value_type, definition.max_value)
            if definition.max_value is not None
            else None
        ),
        "is_default": is_default,
        "updated_at": updated_at,
        "updated_by": updated_by_username,
    }


def get_all_settings() -> list[dict]:
    """Renvoie le catalogue complet, fusionné avec les éventuels overrides en
    base — toujours un jeu complet de réglages, même sur une base vierge."""
    overrides = {
        row.key: row for row in PlatformSetting.objects.select_related("updated_by")
    }
    return [
        _describe(definition, overrides.get(key)) for key, definition in SETTINGS_CATALOG.items()
    ]


@dataclass(frozen=True)
class SettingsUpdateResult:
    """Résultat d'une écriture de réglages : le catalogue complet à jour, et
    le détail before/after de chaque clé effectivement modifiée."""

    settings: list[dict]
    changes: dict[str, dict[str, Any]]


@transaction.atomic
def update_settings(*, actor, changes: dict[str, Any]) -> SettingsUpdateResult:
    """Applique un lot de modifications de réglages.

    - Refuse (`UnknownSettingKeyError`) toute clé absente du catalogue Python
      — la liste blanche qui protège contre l'injection de réglages
      arbitraires (voir `domain/settings_catalog`).
    - Refuse (`InvalidSettingValueError`) toute valeur qui ne respecte pas le
      type ou les bornes déclarés pour la clé.
    - Verrouille (`select_for_update`) les lignes existantes concernées avant
      écriture, pour éviter qu'une modification concurrente ne soit écrasée
      silencieusement (deux opérateurs modifiant le même réglage en même
      temps).
    - Retourne, pour CHAQUE clé modifiée, le couple before/after : c'est ce
      que la vue consomme pour construire l'entrée d'audit
      `SETTINGS_CHANGED` — l'intérêt même de ce module.

    Toute la validation (clés connues, types, bornes) est effectuée AVANT la
    moindre écriture : soit le lot complet est appliqué, soit rien ne l'est.
    """
    if not changes:
        raise InvalidSettingValueError("Aucune modification fournie.")

    definitions: dict[str, SettingDefinition] = {}
    for key in changes:
        definition = SETTINGS_CATALOG.get(key)
        if definition is None:
            raise UnknownSettingKeyError(
                f"« {key} » n'est pas un réglage reconnu par la plateforme."
            )
        definitions[key] = definition

    parsed_values: dict[str, Any] = {
        key: _parse_and_validate(definitions[key], raw_value)
        for key, raw_value in changes.items()
    }

    existing = {
        row.key: row
        for row in PlatformSetting.objects.select_for_update().filter(key__in=changes.keys())
    }

    change_log: dict[str, dict[str, Any]] = {}
    for key, parsed in parsed_values.items():
        definition = definitions[key]
        row = existing.get(key)
        before = (
            row.value
            if row is not None
            else _serialize_value(definition.value_type, definition.default)
        )
        after = _serialize_value(definition.value_type, parsed)

        if row is None:
            row = PlatformSetting(key=key)
        row.value = after
        row.updated_by = actor
        row.save()

        change_log[key] = {"before": before, "after": after}

    return SettingsUpdateResult(settings=get_all_settings(), changes=change_log)
