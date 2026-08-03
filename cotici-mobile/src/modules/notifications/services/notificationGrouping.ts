import type { AppNotification } from '@/types';
import { resolveNotificationSeverity } from './notificationSeverity';

export type NotificationGroup = {
  label: string;
  items: AppNotification[];
};

function isToday(iso: string | undefined): boolean {
  if (!iso) return false;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  const now = new Date();
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

function isWithinDays(iso: string | undefined, days: number): boolean {
  if (!iso) return false;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  const diffMs = Date.now() - date.getTime();
  return diffMs >= 0 && diffMs <= days * 86_400_000;
}

/** Regroupe par urgence puis par date relative : un item n'apparaît que dans
 * un seul groupe (le premier qui correspond). */
export function groupNotificationsByUrgency(items: AppNotification[]): NotificationGroup[] {
  const toTraiter: AppNotification[] = [];
  const aujourdhui: AppNotification[] = [];
  const cetteSemaine: AppNotification[] = [];
  const plusTot: AppNotification[] = [];

  for (const item of items) {
    const severity = resolveNotificationSeverity(item);
    if (!item.estLue && (severity === 'critical' || severity === 'warning')) {
      toTraiter.push(item);
    } else if (isToday(item.dateIso)) {
      aujourdhui.push(item);
    } else if (isWithinDays(item.dateIso, 7)) {
      cetteSemaine.push(item);
    } else {
      plusTot.push(item);
    }
  }

  const groups: NotificationGroup[] = [];
  if (toTraiter.length > 0) groups.push({ label: 'À traiter', items: toTraiter });
  if (aujourdhui.length > 0) groups.push({ label: "Aujourd'hui", items: aujourdhui });
  if (cetteSemaine.length > 0) groups.push({ label: 'Cette semaine', items: cetteSemaine });
  if (plusTot.length > 0) groups.push({ label: 'Plus tôt', items: plusTot });
  return groups;
}
