import type { PlatformSetting } from '@/lib/api/types';

/** Representation editable en memoire d'une valeur de reglage. */
export type EditableValue = string | boolean;

/** Valeur initiale du champ, derivee de la valeur effective renvoyee par l'API. */
export function toEditableValue(item: PlatformSetting): EditableValue {
  return item.value_type === 'boolean' ? Boolean(item.value) : String(item.value);
}

/** True si `current` differe de la valeur effective actuellement connue. */
export function hasChanged(item: PlatformSetting, current: EditableValue): boolean {
  if (item.value_type === 'boolean') return Boolean(current) !== Boolean(item.value);
  return String(current).trim() !== String(item.value).trim();
}

/**
 * Convertit la valeur editee vers le type JSON attendu par le backend
 * (voir `PlatformSettingsUpdatePayload`) : nombre pour un entier, chaine
 * pour un montant decimal (jamais de flottant JSON), booleen pour une
 * bascule.
 */
export function toPayloadValue(
  item: PlatformSetting,
  current: EditableValue,
): string | number | boolean {
  if (item.value_type === 'boolean') return Boolean(current);
  if (item.value_type === 'integer') return Number(String(current).trim());
  return String(current).trim();
}

/**
 * Validation cote client : purement indicative (confort de saisie). La
 * validation qui fait foi est toujours celle du backend, contre le
 * catalogue (`domain/settings_catalog`).
 */
export function isValueValid(item: PlatformSetting, current: EditableValue): boolean {
  if (item.value_type === 'boolean') return true;

  const raw = String(current).trim();
  if (raw === '') return false;

  const numeric = Number(raw);
  if (!Number.isFinite(numeric)) return false;
  if (item.value_type === 'integer' && !Number.isInteger(numeric)) return false;
  if (item.min_value !== null && numeric < Number(item.min_value)) return false;
  if (item.max_value !== null && numeric > Number(item.max_value)) return false;
  return true;
}
