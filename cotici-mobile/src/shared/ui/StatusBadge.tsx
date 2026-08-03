import { StyleSheet, Text, View } from 'react-native';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';

export type StatusTone = 'success' | 'warning' | 'neutral' | 'brand' | 'danger' | 'info';

export type StatusBadgeProps = {
  label: string;
  tone: StatusTone;
};

const TONE_COLOR: Record<StatusTone, string> = {
  success: Colors.success,
  warning: Colors.accent,
  neutral: Colors.gray[500],
  brand: Colors.brand,
  danger: Colors.danger,
  info: Colors.info,
};

/** Badge de statut : source unique pour tout affichage tour/membre/tontine — le
 * texte est toujours présent, la couleur ne porte jamais l'info seule (a11y). */
export function StatusBadge({ label, tone }: StatusBadgeProps) {
  const color = TONE_COLOR[tone];
  return (
    <View
      style={[styles.badge, { backgroundColor: withOpacity(color, 0.12) }]}
      accessibilityRole="text"
    >
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderRadius: Theme.radius.pill,
    paddingHorizontal: Theme.spacing.md,
    paddingVertical: Theme.spacing.xs,
    gap: Theme.spacing.xs,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 12,
  },
});
