import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { AnimatedPressable, EmptyState, InfoBanner, Skeleton, StatusBadge } from '@/shared/ui';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { useNetInfo } from '@react-native-community/netinfo';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';
import type { AppNotification } from '@/types';
import { useNotifications } from '@/modules/notifications/hooks';
import { groupNotificationsByUrgency } from '@/modules/notifications/services/notificationGrouping';
import {
  resolveNotificationIcon,
  resolveNotificationSeverity,
  severityStyle,
} from '@/modules/notifications/services/notificationSeverity';
import { getPushPermissionStatus } from '@/modules/notifications/services/pushRegistration';

const TONE_COLOR: Record<'danger' | 'accent' | 'success' | 'neutral', string> = {
  danger: Colors.danger,
  accent: Colors.accent,
  success: Colors.success,
  neutral: Colors.gray[500],
};

const STATUS_BADGE_TONE: Record<'danger' | 'accent' | 'success' | 'neutral', 'danger' | 'warning' | 'success' | 'neutral'> = {
  danger: 'danger',
  accent: 'warning',
  success: 'success',
  neutral: 'neutral',
};

export default function NotificationsScreen() {
  const router = useRouter();
  const { items, loading, error, reload, markOneRead, markAllRead } = useNotifications();
  const netInfo = useNetInfo();
  const isOffline = netInfo.isConnected === false;
  const [permissionDenied, setPermissionDenied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getPushPermissionStatus().then((status) => {
      if (!cancelled) setPermissionDenied(status === 'denied');
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const unreadCount = useMemo(() => items.filter((n) => !n.estLue).length, [items]);
  const groups = useMemo(() => groupNotificationsByUrgency(items), [items]);

  const handleMarkAllRead = () => {
    void markAllRead();
  };

  const handleNotificationPress = async (notification: AppNotification) => {
    if (!notification.estLue) {
      await markOneRead(notification.id);
    }

    if (notification.category === 'invitation' && notification.sourceType === 'tontine') {
      router.push('/invitations');
      return;
    }

    if (notification.category === 'cotisation' && notification.sourceType === 'tontine' && notification.sourceId) {
      router.push({
        pathname: '/tontine-details',
        params: { id: String(notification.sourceId), focus: 'payment' },
      });
      return;
    }

    if (notification.category === 'paiement') {
      if (notification.sourceType === 'tontine' && notification.sourceId) {
        router.push({ pathname: '/tontine-details', params: { id: String(notification.sourceId) } });
        return;
      }
      if (notification.sourceType === 'solidarity' && notification.sourceId) {
        router.push({
          pathname: '/solidarity-collect/[id]',
          params: { id: String(notification.sourceId) },
        });
        return;
      }
      router.push('/activites-recentes');
      return;
    }

    if (notification.category === 'epargne') {
      router.push('/(tabs)/savings');
      return;
    }
    // `systeme` (sécurité) : marquage lu uniquement, pas de navigation.
  };

  const handlePayNow = (notification: AppNotification) => {
    if (isOffline) return;
    void markOneRead(notification.id);
    if (notification.sourceId) {
      router.push({
        pathname: '/tontine-details',
        params: { id: String(notification.sourceId), focus: 'payment' },
      });
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <AnimatedPressable style={styles.backButton} onPress={() => router.back()}>
          <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>Notifications</Text>
        <AnimatedPressable
          style={[styles.readAllButton, unreadCount === 0 && styles.readAllButtonDisabled]}
          onPress={handleMarkAllRead}
          disabled={unreadCount === 0}
        >
          <Text style={styles.readAllText}>Tout lire</Text>
        </AnimatedPressable>
      </View>

      <Text style={styles.subtitle}>
        {unreadCount > 0
          ? `${unreadCount} notification${unreadCount > 1 ? 's' : ''} non lue${unreadCount > 1 ? 's' : ''}`
          : 'Toutes les notifications sont lues'}
      </Text>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {permissionDenied ? (
          <InfoBanner
            icon="bell-off"
            tone="warning"
            text="Les notifications sont désactivées sur votre téléphone. Activez-les dans les réglages pour ne rien manquer."
          />
        ) : null}

        {loading ? (
          <View style={{ paddingHorizontal: Theme.spacing.page, gap: 10 }}>
            <Skeleton shape="card" height={84} />
            <Skeleton shape="card" height={84} />
            <Skeleton shape="card" height={84} />
          </View>
        ) : error ? (
          <EmptyState
            icon="alert-circle"
            title="Impossible de charger vos notifications"
            description={error}
            actionLabel="Réessayer"
            onAction={() => void reload()}
          />
        ) : items.length === 0 ? (
          <EmptyState
            icon="bell-off"
            title="Aucune notification"
            description="Vous serez averti ici dès qu'il se passera quelque chose d'important."
          />
        ) : (
          groups.map((group) => (
            <View key={group.label} style={styles.groupBlock}>
              <Text style={styles.groupLabel}>{group.label.toUpperCase()}</Text>
              {group.items.map((notification) => {
                const severity = resolveNotificationSeverity(notification);
                const style = severityStyle(severity);
                const icon = resolveNotificationIcon(notification, severity);
                const color = TONE_COLOR[style.tone];
                const badgeTone = STATUS_BADGE_TONE[style.tone];
                const showPayAction = notification.category === 'cotisation' && !!notification.sourceId;

                return (
                  <AnimatedPressable
                    key={notification.id}
                    style={[
                      styles.item,
                      style.tone === 'danger' && styles.itemDanger,
                      !notification.estLue && style.tone !== 'danger' && styles.itemUnread,
                    ]}
                    onPress={() => void handleNotificationPress(notification)}
                  >
                    <View style={[styles.iconWrap, { backgroundColor: withOpacity(color, 0.12) }]}>
                      <Feather name={icon} size={18} color={color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={styles.itemTopRow}>
                        <Text style={styles.itemTitle} numberOfLines={2}>
                          {notification.objet}
                        </Text>
                        {!notification.estLue ? <View style={styles.unreadDot} /> : null}
                      </View>
                      <StatusBadge label={style.label} tone={badgeTone} />
                      <Text style={styles.itemBody}>{notification.corps}</Text>
                      <Text style={styles.itemDate}>{notification.date}</Text>

                      {showPayAction ? (
                        <AnimatedPressable
                          style={[styles.payButton, isOffline && styles.payButtonDisabled]}
                          disabled={isOffline}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          onPress={(event) => {
                            event.stopPropagation();
                            handlePayNow(notification);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={
                            isOffline
                              ? 'Paiement indisponible hors ligne'
                              : `Payer maintenant, ${notification.objet}`
                          }
                        >
                          <Feather
                            name={isOffline ? 'wifi-off' : 'arrow-right-circle'}
                            size={16}
                            color={isOffline ? Colors.gray[500] : Colors.white}
                          />
                          <Text style={[styles.payButtonText, isOffline && styles.payButtonTextDisabled]}>
                            {isOffline ? 'Indisponible hors ligne' : 'Payer maintenant'}
                          </Text>
                        </AnimatedPressable>
                      ) : null}
                    </View>
                  </AnimatedPressable>
                );
              })}
            </View>
          ))
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
  headerTitle: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 20, color: Colors.gray[900] },
  readAllButton: {
    minWidth: 74,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: withOpacity(Colors.brand, 0.3),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withOpacity(Colors.brand, 0.08),
  },
  readAllButtonDisabled: {
    borderColor: Colors.gray[200],
    backgroundColor: Colors.gray[100],
  },
  readAllText: { fontFamily: Fonts.outfit.medium, fontSize: 12, color: Colors.brand },
  subtitle: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    color: Colors.gray[600],
    paddingHorizontal: Theme.spacing.page,
    marginBottom: 16,
  },
  scroll: { paddingBottom: 16 },
  groupBlock: { marginBottom: 6 },
  groupLabel: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 11,
    letterSpacing: 0.6,
    color: Colors.gray[400],
    paddingHorizontal: Theme.spacing.page,
    marginBottom: 8,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginHorizontal: Theme.spacing.page,
    marginBottom: 10,
    padding: 14,
    borderRadius: Theme.radius.md,
    backgroundColor: Theme.screen.surface,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    ...Theme.shadow.soft,
  },
  itemUnread: {
    borderColor: withOpacity(Colors.brand, 0.25),
    backgroundColor: withOpacity(Colors.brand, 0.04),
  },
  // Jamais de rouge plein : fond très clair + bordure fine (pas punitif).
  itemDanger: {
    borderColor: withOpacity(Colors.danger, 0.25),
    backgroundColor: withOpacity(Colors.danger, 0.06),
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  itemTopRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, marginBottom: 6 },
  itemTitle: { flex: 1, fontFamily: Fonts.outfit.medium, fontSize: 15, color: Colors.gray[900] },
  itemBody: { fontFamily: Fonts.outfit.regular, fontSize: 13, color: Colors.gray[600], lineHeight: 18, marginTop: 8, marginBottom: 8 },
  itemDate: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500] },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.accent,
    marginTop: 4,
  },
  payButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    minHeight: 44,
    borderRadius: Theme.radius.pill,
    paddingHorizontal: Theme.spacing.lg,
    backgroundColor: Colors.brand,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  payButtonDisabled: {
    backgroundColor: Colors.gray[200],
  },
  payButtonText: { fontFamily: Fonts.outfit.medium, fontSize: 13, color: Colors.white },
  payButtonTextDisabled: { color: Colors.gray[500] },
});
