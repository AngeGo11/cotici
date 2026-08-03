import { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { Colors } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';
import { Button } from './Button';
import type { ButtonVariant } from './Button';

export type ConfirmSheetProps = {
  visible: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  confirmVariant?: ButtonVariant;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Bottom-sheet de confirmation pour les actions financières engageantes
 * (clôturer un tour, verser une cagnotte, retirer des fonds) — remplace les
 * Alert.alert() natifs qui cassent l'identité visuelle sur ces moments critiques. */
export function ConfirmSheet({
  visible,
  title,
  description,
  confirmLabel,
  cancelLabel = 'Annuler',
  confirmVariant = 'primary',
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmSheetProps) {
  const translateY = useSharedValue(40);
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      translateY.value = withTiming(0, { duration: 220 });
      opacity.value = withTiming(1, { duration: 220 });
    } else {
      translateY.value = withTiming(40, { duration: 160 });
      opacity.value = withTiming(0, { duration: 160 });
    }
  }, [visible, translateY, opacity]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onCancel} accessibilityLabel="Fermer">
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
      </Pressable>
      <SafeAreaView style={styles.wrap} edges={['bottom']} pointerEvents="box-none">
        <Animated.View style={[styles.sheet, sheetStyle]}>
          <View style={styles.handle} />
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.description}>{description}</Text>
          <Button label={confirmLabel} variant={confirmVariant} onPress={onConfirm} loading={loading} />
          <View style={{ height: Theme.spacing.sm }} />
          <Button label={cancelLabel} variant="ghost" onPress={onCancel} disabled={loading} />
        </Animated.View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: Theme.radius.xl,
    borderTopRightRadius: Theme.radius.xl,
    padding: Theme.spacing.xl,
    ...Theme.shadow.card,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.gray[200],
    alignSelf: 'center',
    marginBottom: Theme.spacing.lg,
  },
  title: {
    fontFamily: Fonts.spaceGrotesk.bold,
    fontSize: 20,
    color: Colors.gray[900],
    marginBottom: Theme.spacing.sm,
    textAlign: 'center',
  },
  description: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    color: Colors.gray[600],
    textAlign: 'center',
    marginBottom: Theme.spacing.xl,
  },
});
