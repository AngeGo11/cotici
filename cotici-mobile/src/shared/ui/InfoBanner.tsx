import type { ComponentProps } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';
import { AnimatedPressable } from './AnimatedPressable';

export type InfoBannerTone = 'info' | 'warning' | 'neutral' | 'success' | 'danger';

export type InfoBannerProps = {
  icon: ComponentProps<typeof Feather>['name'];
  text: string;
  tone?: InfoBannerTone;
  /** CTA optionnel (ex. "Payer maintenant", "Activer dans les réglages"). */
  actionLabel?: string;
  onAction?: () => void;
};

const TONE_COLOR: Record<InfoBannerTone, string> = {
  info: Colors.info,
  warning: Colors.accent,
  neutral: Colors.gray[500],
  success: Colors.success,
  danger: Colors.danger,
};

/** Bandeau icône + texte réutilisable — remplace les ~6 bandeaux quasi identiques
 * dupliqués entre écrans (infoBanner, waitBanner, archivedBanner, successBanner...). */
export function InfoBanner({ icon, text, tone = 'info', actionLabel, onAction }: InfoBannerProps) {
  const color = TONE_COLOR[tone];
  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: withOpacity(color, 0.1), borderColor: withOpacity(color, 0.25) },
      ]}
    >
      <Feather name={icon} size={20} color={color} />
      <View style={{ flex: 1 }}>
        <Text style={styles.text}>{text}</Text>
        {actionLabel && onAction ? (
          <AnimatedPressable onPress={onAction} style={styles.actionButton} accessibilityRole="button">
            <Text style={[styles.actionText, { color }]}>{actionLabel}</Text>
            <Feather name="arrow-right" size={14} color={color} />
          </AnimatedPressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Theme.spacing.md,
    marginHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.lg,
    padding: Theme.spacing.lg,
    borderRadius: Theme.radius.lg,
    borderWidth: 1,
  },
  text: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.gray[700],
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Theme.spacing.sm,
  },
  actionText: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 13,
  },
});
