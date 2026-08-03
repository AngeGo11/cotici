import { Colors, withOpacity } from '@/shared/theme/Colors';
import type { ActivityDetail } from '@/types';

export type ActivityTone = NonNullable<ActivityDetail['tone']>;

const CREDIT_TYPES = new Set(['DÉPÔT', 'VERSEMENT_SOLIDAIRE', 'VERSEMENT_CAGNOTTE']);
const NEUTRAL_TYPES = new Set(['VALIDATION_VERSEMENT_SOLIDAIRE']);

export function resolveActivityTone(typeTransaction: string): ActivityTone {
  if (CREDIT_TYPES.has(typeTransaction)) return 'credit';
  if (NEUTRAL_TYPES.has(typeTransaction)) return 'neutral';
  return 'debit';
}

export function activityToneStyle(tone: ActivityTone) {
  switch (tone) {
    case 'credit':
      return {
        icon: 'arrow-down-left' as const,
        iconColor: Colors.success,
        iconBg: withOpacity(Colors.success, 0.1),
        amountColor: Colors.success,
      };
    case 'neutral':
      return {
        icon: 'check-circle' as const,
        iconColor: Colors.brand,
        iconBg: withOpacity(Colors.brand, 0.1),
        amountColor: Colors.gray[800],
      };
    default:
      return {
        icon: 'arrow-up-right' as const,
        iconColor: Colors.danger,
        iconBg: withOpacity(Colors.danger, 0.06),
        amountColor: Colors.danger,
      };
  }
}

export function formatActivityAmount(amount: number, tone: ActivityTone): string {
  const abs = Math.abs(amount).toLocaleString('fr-FR');
  if (tone === 'credit') return `+${abs}`;
  if (tone === 'debit') return `${amount.toLocaleString('fr-FR')}`;
  return abs;
}

export function resolveActivityToneFromDetail(activity: ActivityDetail): ActivityTone {
  return activity.tone ?? (activity.amount > 0 ? 'credit' : 'debit');
}
