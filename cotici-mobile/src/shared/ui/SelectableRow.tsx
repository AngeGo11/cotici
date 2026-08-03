import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';
import { AnimatedPressable } from './AnimatedPressable';

export type SelectableRowProps = {
  leading?: ReactNode;
  title: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
};

/** Ligne de sélection type "carte" (logo | titre/sous-titre | radio) — généralise le
 * sélecteur d'opérateur Mobile Money dupliqué en inline dans RetraitScreen, réutilisable
 * pour tout futur choix (bénéficiaire, méthode de paiement...). Sélection en vert
 * fonctionnel (au lieu du gris/noir neutre initial, incohérent avec le reste du système). */
export function SelectableRow({
  leading,
  title,
  subtitle,
  selected,
  onPress,
  disabled = false,
}: SelectableRowProps) {
  const handlePress = () => {
    if (disabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress();
  };

  return (
    <AnimatedPressable
      style={[styles.row, selected && styles.rowSelected, disabled && styles.rowDisabled]}
      onPress={handlePress}
      disabled={disabled}
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
    >
      {leading ? <View style={styles.leading}>{leading}</View> : null}
      {leading ? <View style={styles.divider} /> : null}
      <View style={styles.textWrap}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>
      <View style={[styles.radioOuter, selected && styles.radioOuterOn]}>
        {selected ? <View style={styles.radioInner} /> : null}
      </View>
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.screen.surface,
    borderRadius: Theme.radius.lg,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    paddingVertical: 14,
    paddingLeft: Theme.spacing.lg,
    paddingRight: Theme.spacing.md,
    minHeight: 72,
    ...Theme.shadow.soft,
  },
  rowSelected: {
    borderColor: Colors.brand,
    borderWidth: 1.5,
  },
  rowDisabled: { opacity: 0.5 },
  leading: { width: 56, alignItems: 'center', justifyContent: 'center' },
  divider: {
    width: 1,
    height: 40,
    backgroundColor: Colors.gray[200],
    marginHorizontal: Theme.spacing.md,
  },
  textWrap: { flex: 1, minWidth: 0, justifyContent: 'center', gap: 4 },
  title: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 16,
    lineHeight: 22,
    color: Colors.gray[900],
    letterSpacing: -0.2,
  },
  subtitle: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.gray[500],
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.gray[300],
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Theme.spacing.sm,
  },
  radioOuterOn: { borderColor: Colors.brand },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.brand,
  },
});
