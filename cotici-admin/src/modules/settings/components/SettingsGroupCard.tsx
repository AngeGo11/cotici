import type { PlatformSetting } from '@/lib/api/types';
import { PERMISSIONS } from '@/lib/permissions';
import { IfPermission } from '@/auth/RequirePermission';
import { Card } from '@/components/ui';
import { SettingField } from './SettingField';
import { isValueValid, type EditableValue } from './settingsValues';

/**
 * Regroupe les reglages d'un meme theme (`PlatformSetting.group`) dans une
 * carte, avec un champ par reglage. L'edition est masquee (champs desactives)
 * pour un membre du staff qui ne porte pas `Perm.SETTINGS_WRITE` — la
 * verification qui fait foi reste cote serveur, cf. `IfPermission`.
 */
export function SettingsGroupCard({
  title,
  items,
  values,
  onChange,
}: {
  title: string;
  items: PlatformSetting[];
  values: Record<string, EditableValue>;
  onChange: (key: string, value: EditableValue) => void;
}) {
  return (
    <Card title={title}>
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => {
          const value = values[item.key];
          if (value === undefined) return null;
          const invalid = !isValueValid(item, value);

          return (
            <IfPermission
              key={item.key}
              permissions={[PERMISSIONS.SETTINGS_WRITE]}
              fallback={<SettingField item={item} value={value} onChange={() => {}} disabled />}
            >
              <SettingField
                item={item}
                value={value}
                onChange={(next) => onChange(item.key, next)}
                error={invalid ? 'Valeur invalide au regard des bornes autorisees.' : undefined}
              />
            </IfPermission>
          );
        })}
      </div>
    </Card>
  );
}
