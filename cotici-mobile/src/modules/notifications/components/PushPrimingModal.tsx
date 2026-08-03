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
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';
import { Button } from '@/shared/ui';

export type PushPrimingModalProps = {
  visible: boolean;
  loading?: boolean;
  onActivate: () => void;
  onDismiss: () => void;
};

/** Écran de « priming » affiché avant le prompt système iOS/Android — jamais
 * au premier lancement (refus quasi assuré), mais après une première action
 * de valeur (création d'une tontine/épargne, première cotisation). Seul le
 * tap sur « Activer » déclenche réellement la demande de permission OS. */
export function PushPrimingModal({ visible, loading = false, onActivate, onDismiss }: PushPrimingModalProps) {
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
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} accessibilityLabel="Fermer">
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
      </Pressable>
      <SafeAreaView style={styles.wrap} edges={['bottom']} pointerEvents="box-none">
        <Animated.View style={[styles.sheet, sheetStyle]}>
          <View style={styles.handle} />
          <View style={styles.iconCircle}>
            <Feather name="bell" size={30} color={Colors.brand} />
          </View>
          <Text style={styles.title}>Ne manquez plus une échéance</Text>
          <Text style={styles.description}>
            COTICI vous prévient avant chaque paiement et quand vous atteignez vos objectifs
            d’épargne.
          </Text>
          <Button label="Activer les notifications" onPress={onActivate} loading={loading} />
          <View style={{ height: Theme.spacing.sm }} />
          <Button label="Plus tard" variant="ghost" onPress={onDismiss} disabled={loading} />
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
    alignItems: 'center',
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
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: Theme.radius.pill,
    backgroundColor: withOpacity(Colors.brand, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Theme.spacing.lg,
  },
  title: {
    fontFamily: Fonts.spaceGrotesk.bold,
    fontSize: 19,
    color: Colors.gray[900],
    marginBottom: Theme.spacing.sm,
    textAlign: 'center',
  },
  description: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.gray[600],
    textAlign: 'center',
    marginBottom: Theme.spacing.xl,
  },
});
