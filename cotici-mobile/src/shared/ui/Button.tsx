import type { ComponentProps } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';
import { AnimatedPressable } from './AnimatedPressable';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  disabled?: boolean;
  leftIcon?: ComponentProps<typeof Feather>['name'];
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
};

const SIZE_STYLE: Record<ButtonSize, { height: number; fontSize: number; iconSize: number; paddingHorizontal: number }> = {
  sm: { height: 40, fontSize: 14, iconSize: 16, paddingHorizontal: Theme.spacing.lg },
  md: { height: 48, fontSize: 16, iconSize: 18, paddingHorizontal: Theme.spacing.xl },
  lg: { height: 56, fontSize: 17, iconSize: 20, paddingHorizontal: Theme.spacing.xl },
};

const VARIANT_STYLE: Record<ButtonVariant, { backgroundColor: string; textColor: string; borderColor?: string }> = {
  primary: { backgroundColor: Colors.brand, textColor: Colors.white },
  secondary: { backgroundColor: withOpacity(Colors.accent, 0.12), textColor: Colors.accent },
  ghost: { backgroundColor: 'transparent', textColor: Colors.gray[700], borderColor: Colors.gray[200] },
  danger: { backgroundColor: Colors.danger, textColor: Colors.white },
};

/** Bouton d'action standard COTICI : variantes de couleur fonctionnelle, taille de
 * zone tactile garantie (≥48pt en md/lg), retour haptique léger au press. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  leftIcon,
  fullWidth = true,
  style,
  accessibilityLabel,
}: ButtonProps) {
  const sizeStyle = SIZE_STYLE[size];
  const variantStyle = VARIANT_STYLE[variant];
  const isDisabled = disabled || loading;

  const handlePress = () => {
    if (isDisabled) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    onPress();
  };

  return (
    <AnimatedPressable
      onPress={handlePress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={[
        styles.base,
        {
          height: sizeStyle.height,
          paddingHorizontal: sizeStyle.paddingHorizontal,
          backgroundColor: variantStyle.backgroundColor,
          borderColor: variantStyle.borderColor,
          borderWidth: variantStyle.borderColor ? 1 : 0,
          alignSelf: fullWidth ? 'stretch' : undefined,
          opacity: isDisabled ? 0.6 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variantStyle.textColor} />
      ) : (
        <>
          {leftIcon && (
            <Feather
              name={leftIcon}
              size={sizeStyle.iconSize}
              color={variantStyle.textColor}
              style={styles.icon}
            />
          )}
          <Text
            style={[styles.label, { fontSize: sizeStyle.fontSize, color: variantStyle.textColor }]}
          >
            {label}
          </Text>
        </>
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Theme.radius.md,
    minWidth: 48,
  },
  icon: {
    marginRight: Theme.spacing.sm,
  },
  label: {
    fontFamily: Fonts.outfit.medium,
  },
});
