import { useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Colors } from '@/shared/theme/Colors';
import { Theme } from '@/shared/theme/Theme';

export type SkeletonShape = 'text' | 'circle' | 'card';

export type SkeletonProps = {
  shape?: SkeletonShape;
  width?: number | `${number}%`;
  height?: number;
  style?: StyleProp<ViewStyle>;
};

const SHAPE_DEFAULT: Record<SkeletonShape, { width: number | `${number}%`; height: number; radius: number }> = {
  text: { width: '60%', height: 14, radius: 4 },
  circle: { width: 48, height: 48, radius: 999 },
  card: { width: '100%', height: 96, radius: Theme.radius.lg },
};

/** Placeholder de chargement à shimmer (Reanimated) — remplace les écrans qui
 * passaient directement d'un spinner plein écran au contenu sans transition. */
export function Skeleton({ shape = 'text', width, height, style }: SkeletonProps) {
  const defaults = SHAPE_DEFAULT[shape];
  const opacity = useSharedValue(0.4);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(withTiming(1, { duration: 700 }), withTiming(0.4, { duration: 700 })),
      -1,
      true,
    );
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        {
          width: width ?? defaults.width,
          height: height ?? defaults.height,
          borderRadius: shape === 'circle' ? (height ?? defaults.height) / 2 : defaults.radius,
          backgroundColor: Colors.gray[200],
        },
        animatedStyle,
        style,
      ]}
    />
  );
}
