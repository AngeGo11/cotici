import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type ProgressGaugeProps = {
  /** Progression 0..1 (ex. tour courant / total, ou épargné / objectif). */
  progress: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
  /** Texte court affiché au centre du cercle (ex. "3"). Toujours requis : la
   * couleur seule ne doit jamais porter l'information (a11y). */
  label: string;
  /** Deuxième ligne, plus petite, sous le label (ex. "atteint"). */
  sublabel?: string;
  /** Description longue pour lecteurs d'écran (ex. "Tour 3 sur 8"). Par défaut = label. */
  accessibilityLabel?: string;
};

/** Jauge circulaire réutilisable (tours de tontine, objectifs d'épargne) — généralise
 * le cercle SVG jusqu'ici dupliqué en inline dans TontineDetailsScreen, avec une
 * transition animée (spring) au lieu d'un saut brut à chaque changement de valeur. */
export function ProgressGauge({
  progress,
  size = 56,
  strokeWidth = 6,
  color = Colors.success,
  label,
  sublabel,
  accessibilityLabel,
}: ProgressGaugeProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));

  const animatedProgress = useSharedValue(clamped);
  useEffect(() => {
    animatedProgress.value = withSpring(clamped, { damping: 16, stiffness: 120 });
  }, [animatedProgress, clamped]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - animatedProgress.value),
  }));

  return (
    <View
      style={[styles.wrap, { width: size, height: size }]}
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped * 100) }}
    >
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={withOpacity(color, 0.2)}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          animatedProps={animatedProps}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Text style={[styles.label, { fontSize: size * 0.32 }]}>{label}</Text>
        {sublabel ? <Text style={[styles.sublabel, { fontSize: size * 0.07 }]}>{sublabel}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontFamily: Fonts.spaceGrotesk.bold,
    color: Colors.gray[900],
  },
  sublabel: {
    fontFamily: Fonts.outfit.regular,
    color: Colors.gray[500],
    marginTop: 2,
  },
});
