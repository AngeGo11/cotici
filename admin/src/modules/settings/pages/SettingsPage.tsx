import { useEffect, useMemo, useState } from 'react';
import { RotateCcw, Save, Settings as SettingsIcon } from 'lucide-react';
import { IfPermission } from '@/auth/RequirePermission';
import { errorMessage } from '@/lib/api/client';
import { PERMISSIONS } from '@/lib/permissions';
import { Button, Card, EmptyState, ReasonDialog, Skeleton, useToast } from '@/components/ui';
import { PageHeader } from '@/layout/PageHeader';
import { useSettingsList, useUpdateSettings } from '../api/settings';
import { SettingsGroupCard } from '../components/SettingsGroupCard';
import { GROUP_LABELS, GROUP_ORDER } from '../components/settingsGroups';
import {
  hasChanged,
  isValueValid,
  toEditableValue,
  toPayloadValue,
  type EditableValue,
} from '../components/settingsValues';

export default function SettingsPage() {
  const toast = useToast();
  const { data, isLoading, isError, error } = useSettingsList();
  const updateSettings = useUpdateSettings();

  const [draft, setDraft] = useState<Record<string, EditableValue>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);

  // Ne complete le brouillon qu'avec les cles pas encore presentes
  // localement : une saisie en cours ne doit jamais etre ecrasee par un
  // refetch (ex. apres l'invalidation de la requete suite a une ecriture).
  useEffect(() => {
    if (!data) return;
    setDraft((current) => {
      const next = { ...current };
      let changed = false;
      for (const item of data) {
        if (!(item.key in next)) {
          next[item.key] = toEditableValue(item);
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [data]);

  const groups = useMemo(() => {
    if (!data) return [];
    const byGroup = new Map<string, typeof data>();
    for (const item of data) {
      const list = byGroup.get(item.group) ?? [];
      list.push(item);
      byGroup.set(item.group, list);
    }
    const knownGroups = GROUP_ORDER.filter((group) => byGroup.has(group));
    const otherGroups = [...byGroup.keys()].filter((group) => !GROUP_ORDER.includes(group)).sort();
    return [...knownGroups, ...otherGroups].map((group) => ({
      key: group,
      label: GROUP_LABELS[group] ?? group,
      items: byGroup.get(group)!,
    }));
  }, [data]);

  const { changes, hasInvalid } = useMemo(() => {
    const result: Record<string, string | number | boolean> = {};
    let invalid = false;
    if (data) {
      for (const item of data) {
        const current = draft[item.key];
        if (current === undefined) continue;
        if (!hasChanged(item, current)) continue;
        if (!isValueValid(item, current)) {
          invalid = true;
          continue;
        }
        result[item.key] = toPayloadValue(item, current);
      }
    }
    return { changes: result, hasInvalid: invalid };
  }, [data, draft]);

  const changedKeys = Object.keys(changes);
  const isDirty = changedKeys.length > 0;

  const handleReset = () => {
    if (!data) return;
    setDraft(Object.fromEntries(data.map((item) => [item.key, toEditableValue(item)])));
  };

  const handleConfirm = async (reason: string) => {
    try {
      await updateSettings.mutateAsync({ changes, reason });
      toast.success(
        'Parametres enregistres',
        `${changedKeys.length} reglage(s) modifie(s).`,
      );
      setConfirmOpen(false);
    } catch (caught) {
      toast.error('Enregistrement refuse', errorMessage(caught));
    }
  };

  return (
    <div>
      <PageHeader
        title="Parametres plateforme"
        description="Plafonds, penalites de retard et bascules de la plateforme. Chaque modification est journalisee avec un motif."
        actions={
          <IfPermission permissions={[PERMISSIONS.SETTINGS_WRITE]}>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleReset}
                disabled={!isDirty}
                icon={<RotateCcw className="h-3.5 w-3.5" aria-hidden />}
              >
                Annuler les modifications
              </Button>
              <Button
                size="sm"
                onClick={() => setConfirmOpen(true)}
                disabled={!isDirty || hasInvalid}
                icon={<Save className="h-3.5 w-3.5" aria-hidden />}
              >
                Enregistrer
              </Button>
            </div>
          </IfPermission>
        }
      />

      {isLoading && (
        <Card>
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-9 w-full" />
            ))}
          </div>
        </Card>
      )}

      {isError && (
        <Card>
          <EmptyState
            title="Impossible de charger les parametres"
            description={errorMessage(error)}
            icon={<SettingsIcon className="h-8 w-8" aria-hidden />}
          />
        </Card>
      )}

      {!isLoading && !isError && groups.length === 0 && (
        <Card>
          <EmptyState title="Aucun parametre disponible" icon={<SettingsIcon className="h-8 w-8" aria-hidden />} />
        </Card>
      )}

      {!isLoading && !isError && groups.length > 0 && (
        <div className="space-y-4">
          {groups.map((group) => (
            <SettingsGroupCard
              key={group.key}
              title={group.label}
              items={group.items}
              values={draft}
              onChange={(key, value) => setDraft((current) => ({ ...current, [key]: value }))}
            />
          ))}
        </div>
      )}

      <ReasonDialog
        open={confirmOpen}
        title="Confirmer la modification des parametres"
        message={
          <div className="space-y-1.5">
            <p>
              {changedKeys.length} reglage(s) seront modifies et journalises avec votre
              identifiant, l’horodatage et le motif saisi :
            </p>
            <ul className="list-disc space-y-0.5 pl-4 font-mono text-xxs text-slate-600">
              {changedKeys.map((key) => (
                <li key={key}>{key}</li>
              ))}
            </ul>
          </div>
        }
        confirmLabel="Confirmer"
        destructive={false}
        loading={updateSettings.isPending}
        onConfirm={(reason) => void handleConfirm(reason)}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}
