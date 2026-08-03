import type { PropsWithChildren } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';
import { Colors } from '@/shared/theme/Colors';
import { Theme } from '@/shared/theme/Theme';

export type CardVariant = 'surface' | 'hero' | 'outline' | 'soft';

export type CardProps = PropsWithChildren<{
  variant?: CardVariant;
  /** Clé de Theme.spacing, ou nombre de px direct. Défaut 'lg'. */
  padding?: keyof typeof Theme.spacing | number;
  style?: StyleProp<ViewStyle>;
}>;

const VARIANT_STYLE: Record<CardVariant, ViewStyle> = {
  surface: {
    backgroundColor: Colors.white,
    borderRadius: Theme.radius.lg,
    ...Theme.shadow.card,
  },
  hero: {
    backgroundColor: Colors.brand,
    borderRadius: Theme.radius.xl,
    ...Theme.shadow.brandHero,
  },
  outline: {
    backgroundColor: Colors.white,
    borderRadius: Theme.radius.lg,
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  soft: {
    backgroundColor: Colors.white,
    borderRadius: Theme.radius.md,
    ...Theme.shadow.soft,
  },
};

export function Card({ children, variant = 'surface', padding = 'lg', style }: CardProps) {
  const paddingValue = typeof padding === 'number' ? padding : Theme.spacing[padding];
  return (
    <View style={[VARIANT_STYLE[variant], { padding: paddingValue }, style]}>{children}</View>
  );
}
