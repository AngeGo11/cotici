import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { AnimatedPressable, EmptyState, InfoBanner, Skeleton } from '@/shared/ui';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';
import {
  fetchNotificationPreferences,
  updateNotificationPreferences,
  type NotificationCategory,
  type NotificationPreferences,
} from '@/shared/api';
import { getPushPermissionStatus } from '@/modules/notifications/services/pushRegistration';

type ToggleableCategory = Extract<NotificationCategory, 'cotisation' | 'epargne' | 'invitation'>;

const TOGGLEABLE_CATEGORIES: { id: ToggleableCategory; title: string; description: string; icon: keyof typeof Feather.glyphMap }[] = [
  {
    id: 'cotisation',
    title: 'Rappels de paiement',
    description: 'Échéances de cotisation à venir ou du jour.',
    icon: 'clock',
  },
  {
    id: 'epargne',
    title: 'Objectifs d’épargne',
    description: 'Progression et objectifs atteints.',
    icon: 'trending-up',
  },
  {
    id: 'invitation',
    title: 'Invitations',
    description: 'Invitations à rejoindre une tontine.',
    icon: 'mail',
  },
];

export default function NotificationPreferencesScreen() {
  const router = useRouter();
  const isMountedRef = useRef(true);
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [devicePermissionDenied, setDevicePermissionDenied] = useState(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [prefsResult, permissionStatus] = await Promise.all([
      fetchNotificationPreferences(),
      getPushPermissionStatus(),
    ]);
    if (!isMountedRef.current) return;
    setDevicePermissionDenied(permissionStatus === 'denied');
    if (prefsResult.ok) {
      setPrefs(prefsResult.data);
    } else {
      setError(prefsResult.detail);
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const applyPatch = useCallback(
    async (key: string, patch: Partial<NotificationPreferences>) => {
      if (!prefs) return;
      const previous = prefs;
      const optimistic: NotificationPreferences = { ...prefs, ...patch };
      setPrefs(optimistic);
      setSavingKey(key);
      const result = await updateNotificationPreferences(patch);
      if (!isMountedRef.current) return;
      setSavingKey(null);
      if (result.ok) {
        setPrefs(result.data);
      } else {
        setPrefs(previous);
      }
    },
    [prefs],
  );

  const handleTogglePushEnabled = (value: boolean) => {
    void applyPatch('push_enabled', { push_enabled: value });
  };

  const handleToggleCategory = (category: ToggleableCategory, enabled: boolean) => {
    if (!prefs) return;
    const muted = new Set(prefs.categories_muted);
    if (enabled) {
      muted.delete(category);
    } else {
      muted.add(category);
    }
    void applyPatch(category, { categories_muted: Array.from(muted) });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <AnimatedPressable style={styles.backButton} onPress={() => router.back()}>
          <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>Préférences de notifications</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {loading ? (
          <View style={{ paddingHorizontal: Theme.spacing.page, gap: 10 }}>
            <Skeleton shape="card" height={64} />
            <Skeleton shape="card" height={64} />
            <Skeleton shape="card" height={64} />
            <Skeleton shape="card" height={90} />
          </View>
        ) : error || !prefs ? (
          <EmptyState
            icon="alert-circle"
            title="Impossible de charger vos préférences"
            description={error ?? undefined}
            actionLabel="Réessayer"
            onAction={() => void load()}
          />
        ) : (
          <>
            {devicePermissionDenied ? (
              <InfoBanner
                icon="bell-off"
                tone="warning"
                text="Les notifications sont désactivées sur votre téléphone. Activez-les dans les réglages pour recevoir vos alertes COTICI."
              />
            ) : null}

            <View style={styles.card}>
              <View style={styles.rowTop}>
                <View style={styles.rowLeft}>
                  <View style={[styles.iconWrap, { backgroundColor: withOpacity(Colors.brand, 0.12) }]}>
                    <Feather name="bell" size={18} color={Colors.brand} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>Notifications push</Text>
                    <Text style={styles.rowDescription}>Activer ou couper toutes les alertes non essentielles.</Text>
                  </View>
                </View>
                <Switch
                  value={prefs.push_enabled}
                  onValueChange={handleTogglePushEnabled}
                  disabled={savingKey === 'push_enabled'}
                  trackColor={{ false: Colors.gray[300], true: withOpacity(Colors.brand, 0.5) }}
                  thumbColor={prefs.push_enabled ? Colors.brand : Colors.white}
                />
              </View>
            </View>

            <Text style={styles.sectionLabel}>Par catégorie</Text>
            <View style={styles.card}>
              {TOGGLEABLE_CATEGORIES.map((category, index) => {
                const enabled = prefs.push_enabled && !prefs.categories_muted.includes(category.id);
                return (
                  <View
                    key={category.id}
                    style={[styles.row, index < TOGGLEABLE_CATEGORIES.length - 1 && styles.rowBorder]}
                  >
                    <View style={styles.rowLeft}>
                      <View style={[styles.iconWrap, { backgroundColor: withOpacity(Colors.gray[500], 0.12) }]}>
                        <Feather name={category.icon} size={18} color={Colors.gray[600]} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rowTitle}>{category.title}</Text>
                        <Text style={styles.rowDescription}>{category.description}</Text>
                      </View>
                    </View>
                    <Switch
                      value={enabled}
                      onValueChange={(value) => handleToggleCategory(category.id, value)}
                      disabled={!prefs.push_enabled || savingKey === category.id}
                      trackColor={{ false: Colors.gray[300], true: withOpacity(Colors.brand, 0.5) }}
                      thumbColor={enabled ? Colors.brand : Colors.white}
                    />
                  </View>
                );
              })}
            </View>

            <View style={styles.lockedCard}>
              <View style={styles.lockedHeader}>
                <View style={[styles.iconWrap, { backgroundColor: withOpacity(Colors.gray[600], 0.14) }]}>
                  <Feather name="lock" size={18} color={Colors.gray[700]} />
                </View>
                <Text style={styles.lockedTitle}>Sécurité & argent — toujours activées</Text>
              </View>
              <Text style={styles.lockedDescription}>
                Connexions, transactions, retraits : pour votre sécurité, ces alertes ne peuvent pas
                être désactivées.
              </Text>
            </View>

            {devicePermissionDenied ? (
              <AnimatedPressable style={styles.settingsLink} onPress={() => void Linking.openSettings()}>
                <Feather name="settings" size={16} color={Colors.brand} />
                <Text style={styles.settingsLinkText}>Activer dans les réglages du téléphone</Text>
              </AnimatedPressable>
            ) : null}
          </>
        )}
        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.screen.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Theme.spacing.page,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 18, color: Colors.gray[900], flex: 1, textAlign: 'center' },
  scroll: { paddingHorizontal: Theme.spacing.page, paddingBottom: 16, gap: 4 },
  sectionLabel: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 13,
    color: Colors.gray[500],
    marginTop: Theme.spacing.lg,
    marginBottom: Theme.spacing.sm,
  },
  card: {
    backgroundColor: Theme.screen.surface,
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    ...Theme.shadow.soft,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Theme.spacing.lg,
    gap: Theme.spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: Theme.spacing.lg,
    gap: Theme.spacing.md,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.gray[100],
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: Theme.spacing.md, flex: 1 },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontFamily: Fonts.outfit.medium, fontSize: 15, color: Colors.gray[900] },
  rowDescription: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500], marginTop: 2 },
  lockedCard: {
    marginTop: Theme.spacing.lg,
    backgroundColor: withOpacity(Colors.gray[600], 0.06),
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: withOpacity(Colors.gray[600], 0.18),
    padding: Theme.spacing.lg,
  },
  lockedHeader: { flexDirection: 'row', alignItems: 'center', gap: Theme.spacing.md, marginBottom: Theme.spacing.sm },
  lockedTitle: { flex: 1, fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.gray[800] },
  lockedDescription: { fontFamily: Fonts.outfit.regular, fontSize: 13, lineHeight: 19, color: Colors.gray[600] },
  settingsLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Theme.spacing.sm,
    marginTop: Theme.spacing.lg,
    paddingVertical: 12,
  },
  settingsLinkText: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.brand },
});
