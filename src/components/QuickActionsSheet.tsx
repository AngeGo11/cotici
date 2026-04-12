import { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  Animated,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { Fonts } from '@/constants/Fonts';
import { Theme } from '@/constants/Theme';

type Props = {
  visible: boolean;
  onClose: () => void;
};

const actions = [
  {
    key: 'deposit',
    label: 'Faire un dépôt',
    icon: 'arrow-down-circle' as const,
    href: '/deposit-to-account' as const,
  },
  {
    key: 'cotisation',
    label: 'Payer ma cotisation',
    icon: 'credit-card' as const,
    href: '/make-deposit' as const,
  },
  {
    key: 'project',
    label: 'Créer un nouveau projet',
    icon: 'folder-plus' as const,
    href: '/create-savings' as const,
  },
];

const OFF_Y = 340;

export function QuickActionsSheet({ visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const slide = useRef(new Animated.Value(OFF_Y)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) {
      slide.setValue(OFF_Y);
      fade.setValue(0);
      return;
    }
    slide.setValue(OFF_Y);
    fade.setValue(0);
    Animated.parallel([
      Animated.timing(fade, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.spring(slide, {
        toValue: 0,
        damping: 24,
        stiffness: 260,
        mass: 0.8,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, fade, slide]);

  const handleNavigate = (href: (typeof actions)[number]['href']) => {
    onClose();
    router.push(href);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: fade }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
        <Animated.View
          style={[
            styles.sheet,
            {
              paddingBottom: Math.max(insets.bottom, 16),
              transform: [{ translateY: slide }],
            },
          ]}
        >
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>Actions rapides</Text>
          <Text style={styles.sheetSubtitle}>
            {"Mettez de l'argent en mouvement en un geste"}
          </Text>

          {actions.map((item, i) => (
            <TouchableOpacity
              key={item.key}
              style={[styles.row, i === actions.length - 1 && styles.rowLast]}
              onPress={() => handleNavigate(item.href)}
              activeOpacity={0.7}
            >
              <View style={styles.rowIconWrap}>
                <Feather name={item.icon} size={22} color={Colors.brand} />
              </View>
              <Text style={styles.rowLabel}>{item.label}</Text>
              <Feather name="chevron-right" size={20} color={Colors.gray[400]} />
            </TouchableOpacity>
          ))}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(17, 24, 39, 0.45)',
  },
  sheet: {
    backgroundColor: Theme.screen.surface,
    borderTopLeftRadius: Theme.radius.xl,
    borderTopRightRadius: Theme.radius.xl,
    paddingHorizontal: Theme.spacing.xl,
    paddingTop: Theme.spacing.md,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 20,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.gray[300],
    marginBottom: Theme.spacing.lg,
  },
  sheetTitle: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 20,
    color: Colors.gray[900],
    marginBottom: 4,
  },
  sheetSubtitle: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    color: Colors.gray[500],
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.gray[100],
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowIconWrap: {
    width: 48,
    height: 48,
    borderRadius: Theme.radius.sm,
    backgroundColor: Colors.gray[50],
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[100],
  },
  rowLabel: {
    flex: 1,
    fontFamily: Fonts.outfit.medium,
    fontSize: 16,
    color: Colors.gray[900],
  },
});
