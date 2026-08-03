import type { AppNotification } from '@/types';

export type NotificationSeverity = 'critical' | 'warning' | 'positive' | 'neutral';

export type SeverityStyle = {
  label: string;
  icon: 'alert-triangle' | 'clock' | 'check-circle' | 'trending-up' | 'mail' | 'shield';
  tone: 'danger' | 'accent' | 'success' | 'neutral';
};

/**
 * Le contrat backend actuel ne fournit pas de champ de gravité explicite
 * (uniquement `category`, `source_type`, `objet`, `contenu`). On dérive donc
 * la criticité à partir de mots-clés dans le contenu + de la catégorie —
 * une heuristique documentée, à remplacer si le backend expose un jour un
 * champ `severity` dédié.
 */
export function resolveNotificationSeverity(notification: AppNotification): NotificationSeverity {
  const text = `${notification.objet} ${notification.corps}`.toLowerCase();

  if (/retard|impay|échu|échéance dépassée|en souffrance|non réglé/.test(text)) {
    return 'critical';
  }

  if (notification.category === 'paiement' || notification.category === 'epargne') {
    if (/confirmé|reçu|enregistr|réussi|atteint|félicit|bravo/.test(text)) {
      return 'positive';
    }
    return 'positive';
  }

  if (notification.category === 'cotisation') {
    return 'warning';
  }

  return 'neutral';
}

const SEVERITY_STYLE: Record<NotificationSeverity, SeverityStyle> = {
  critical: { label: 'Urgent', icon: 'alert-triangle', tone: 'danger' },
  warning: { label: 'À faire', icon: 'clock', tone: 'accent' },
  positive: { label: 'Bravo', icon: 'trending-up', tone: 'success' },
  neutral: { label: 'Info', icon: 'shield', tone: 'neutral' },
};

export function severityStyle(severity: NotificationSeverity): SeverityStyle {
  return SEVERITY_STYLE[severity];
}

/** Affine l'icône du style de sévérité pour distinguer paiement confirmé
 * (check-circle) d'objectif d'épargne atteint (trending-up), tous deux
 * classés en sévérité "positive". */
export function resolveNotificationIcon(
  notification: AppNotification,
  severity: NotificationSeverity,
): SeverityStyle['icon'] {
  if (severity === 'positive') {
    return notification.category === 'epargne' ? 'trending-up' : 'check-circle';
  }
  if (severity === 'neutral' && notification.category === 'invitation') {
    return 'mail';
  }
  return SEVERITY_STYLE[severity].icon;
}
