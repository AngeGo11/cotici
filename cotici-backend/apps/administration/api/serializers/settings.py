"""Serializers de `/api/admin/settings/`."""
from __future__ import annotations

from rest_framework import serializers


class PlatformSettingSerializer(serializers.Serializer):
    """Représentation en lecture d'un réglage plateforme (fusion du
    catalogue Python et de son éventuel override en base — voir
    `services/settings_service.get_all_settings`).

    Purement en sortie : ce serializer ne valide aucune écriture. La liste
    des clés autorisées, leur type et leurs bornes sont figés dans
    `domain/settings_catalog.SETTINGS_CATALOG` ; la validation d'écriture est
    entièrement déléguée à `services/settings_service.update_settings`, seule
    source de vérité, pour ne jamais dupliquer (et risquer de faire diverger)
    cette connaissance ici.
    """

    key = serializers.CharField()
    label = serializers.CharField()
    description = serializers.CharField()
    group = serializers.CharField()
    #: "integer" | "decimal" | "boolean" (voir `domain.settings_catalog.SettingType`).
    value_type = serializers.CharField()
    #: Valeur effective (override en base si présent, sinon valeur par
    #: défaut du catalogue). Les montants (`value_type="decimal"`) sont des
    #: CHAÎNES (ex. `"1500"`), jamais des nombres flottants JSON.
    value = serializers.JSONField()
    default_value = serializers.JSONField()
    min_value = serializers.JSONField(allow_null=True)
    max_value = serializers.JSONField(allow_null=True)
    #: `True` si aucune valeur n'a jamais été écrite pour cette clé (le
    #: `value` renvoyé est alors celui du catalogue, pas un override en base).
    is_default = serializers.BooleanField()
    updated_at = serializers.DateTimeField(allow_null=True)
    updated_by = serializers.CharField(allow_null=True)


class PlatformSettingsUpdateSerializer(serializers.Serializer):
    """`PATCH /api/admin/settings/` : mise à jour partielle du catalogue.

    `changes` est une simple `DictField` (clé -> valeur JSON brute) plutôt
    qu'un schéma champ par champ : la liste des clés valides et le type
    attendu pour chacune sont déjà figés par le catalogue Python
    (`domain/settings_catalog.SETTINGS_CATALOG`), qui reste la SEULE source
    de vérité — dupliquer cette connaissance ici serait redondant et
    risquerait de diverger avec le temps. La validation fine (clé connue,
    type, bornes) est déléguée à `services/settings_service.update_settings`.

    `reason` est obligatoire : `SETTINGS_CHANGED` est une action sensible
    (voir `domain/audit_actions.SENSITIVE_ACTIONS`), le motif est de toute
    façon recontrôlé côté vue/mixin avant toute écriture.
    """

    changes = serializers.DictField(
        child=serializers.JSONField(),
        allow_empty=False,
        help_text="Clé de réglage -> nouvelle valeur (JSON brut).",
    )
    reason = serializers.CharField(
        allow_blank=False,
        help_text="Motif obligatoire : consigné avec le avant/après de chaque clé modifiée.",
    )
