import type { PressableProps, StyleProp, ViewStyle } from 'react-native';
import { Pressable } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

const SPRING_PRESS = { damping: 18, stiffness: 420, mass: 0.55 };
const SPRING_RELEASE = { damping: 14, stiffness: 320, mass: 0.7 };

const RNAnimatedPressable = Animated.createAnimatedComponent(Pressable);

export type AnimatedPressableProps = PressableProps & {
  /** Scale appliqué au press (défaut 0.96). */
  scaleTo?: number;
  /** Désactive l'animation de scale (liens texte, etc.). */
  disableScale?: boolean;
};

export function AnimatedPressable({
  children,
  style,
  scaleTo = 0.96,
  disableScale = false,
  disabled,
  onPressIn,
  onPressOut,
  ...rest
}: AnimatedPressableProps) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <RNAnimatedPressable
      disabled={disabled}
      style={[style as StyleProp<ViewStyle>, !disableScale && animatedStyle]}
      onPressIn={(event) => {
        if (!disabled && !disableScale) {
          scale.value = withSpring(scaleTo, SPRING_PRESS);
        }
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        if (!disableScale) {
          scale.value = withSpring(1, SPRING_RELEASE);
        }
        onPressOut?.(event);
      }}
      {...rest}
    >
      {children}
    </RNAnimatedPressable>
  );
}
