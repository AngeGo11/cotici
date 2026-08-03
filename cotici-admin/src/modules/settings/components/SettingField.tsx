import type { PlatformSetting } from '@/lib/api/types';
import { formatDateTime } from '@/lib/format';
import { Badge, Input, Select } from '@/components/ui';
import type { EditableValue } from './settingsValues';

/** Champ de saisie d'un reglage unique, adapte a son `value_type`. */
export function SettingField({
  item,
  value,
  onChange,
  error,
  disabled = false,
}: {
  item: PlatformSetting;
  value: EditableValue;
  onChange: (value: EditableValue) => void;
  error?: string;
  disabled?: boolean;
}) {
  const bounds =
    item.min_value !== null && item.max_value !== null
      ? `Entre ${item.min_value} et ${item.max_value}.`
      : item.min_value !== null
        ? `Minimum ${item.min_value}.`
        : item.max_value !== null
          ? `Maximum ${item.max_value}.`
          : null;

  const lastChange = item.updated_at
    ? `Modifie le ${formatDateTime(item.updated_at)}${item.updated_by ? ` par ${item.updated_by}` : ''}.`
    : 'Jamais modifie (valeur par defaut).';

  const hint = [bounds, lastChange].filter(Boolean).join(' ');

  return (
    <div className="flex flex-col gap-2 rounded-md border border-slate-100 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-slate-900">{item.label}</p>
          <p className="mt-0.5 text-xxs text-slate-500">{item.description}</p>
        </div>
        {item.is_default ? (
          <Badge tone="neutral">Par defaut</Badge>
        ) : (
          <Badge tone="brand">Personnalise</Badge>
        )}
      </div>

      {item.value_type === 'boolean' ? (
        <Select
          value={String(Boolean(value))}
          onChange={(event) => onChange(event.target.value === 'true')}
          disabled={disabled}
          options={[
            { value: 'true', label: 'Actif' },
            { value: 'false', label: 'Inactif' },
          ]}
          hint={hint}
        />
      ) : (
        <Input
          value={String(value)}
          onChange={(event) => onChange(event.target.value)}
          inputMode={item.value_type === 'integer' ? 'numeric' : 'decimal'}
          disabled={disabled}
          error={error}
          hint={error ? undefined : hint}
        />
      )}
    </div>
  );
}
