import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { AnimatedPressable, Card, EmptyState, InfoBanner, Skeleton } from '@/shared/ui';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';
import { UPCOMING_DEADLINES, getMostUrgentDeadline, parseDueInDays } from '@/data/upcomingDeadlines';
import { useWalletActivities } from '@/modules/activity/hooks';
import {
  activityToneStyle,
  formatActivityAmount,
  resolveActivityToneFromDetail,
} from '@/shared/api/activityDisplay';
import {
  useAuth,
  formatFcfaDots,
  formatMonthlyFlow,
  getGreetingName,
  getUserInitials,
} from '@/shared/auth';
import { useUnreadNotificationsCount } from '@/modules/notifications/hooks';

function formatTodayFr(): string {
  const d = new Date();
  const raw = d.toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export default function HomeScreen() {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const { user, refreshUser } = useAuth();
  const { activities, loading: loadingActivities } = useWalletActivities();
  const unreadNotificationsCount = useUnreadNotificationsCount();
  const recentActivities = activities.slice(0, 5);
  const [balanceVisible, setBalanceVisible] = useState(true);
  const balanceOpacity = useSharedValue(1);
  const balanceAnimatedStyle = useAnimatedStyle(() => ({ opacity: balanceOpacity.value }));

  useEffect(() => {
    balanceOpacity.value = withTiming(0, { duration: 90 }, () => {
      balanceOpacity.value = withTiming(1, { duration: 160 });
    });
    // Ne pas re-déclencher au montage initial, seulement quand balanceVisible change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [balanceVisible]);

  const toggleBalanceVisible = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    setBalanceVisible((v) => !v);
  }, []);

  const statScrollRef = useRef<ScrollView>(null);
  const [statPageIndex, setStatPageIndex] = useState(0);

  useFocusEffect(
    useCallback(() => {
      void refreshUser();
    }, [refreshUser]),
  );
  const dateLabel = formatTodayFr();
  const greetingName = getGreetingName(user);
  const initials = getUserInitials(user);
  const balanceDisplay = formatFcfaDots(user?.solde_courant);
  const entreesDisplay = formatMonthlyFlow(user?.entrees_ce_mois, 'in');
  const sortiesDisplay = formatMonthlyFlow(user?.sorties_ce_mois, 'out');
  const epargneDisplay = `${formatFcfaDots(user?.epargne_totale)} F`;
  const tontineDisplay = `${formatFcfaDots(user?.tontine_cotisations_mois)} F`;
  const upcomingCount = UPCOMING_DEADLINES.length;
  const accentColor = Colors.success;

  // Un seul bandeau d'échéance actif à la fois (le plus urgent), masquable
  // pour la session en cours — ne duplique pas le centre de notifications.
  const [urgentBannerDismissed, setUrgentBannerDismissed] = useState(false);
  const mostUrgentDeadline = useMemo(() => getMostUrgentDeadline(UPCOMING_DEADLINES), []);
  const mostUrgentDays = mostUrgentDeadline ? parseDueInDays(mostUrgentDeadline.dueRelative) : null;
  const showUrgentBanner =
    !urgentBannerDismissed && !!mostUrgentDeadline && mostUrgentDays != null && mostUrgentDays <= 3;
  const urgentBannerText = mostUrgentDeadline
    ? mostUrgentDays === 0
      ? `${mostUrgentDeadline.title} — échéance aujourd'hui (${mostUrgentDeadline.amountF.toLocaleString('fr-FR')} F).`
      : `${mostUrgentDeadline.title} — ${mostUrgentDeadline.dueRelative} (${mostUrgentDeadline.amountF.toLocaleString('fr-FR')} F).`
    : '';

  const statCards = useMemo(
    () => [
      {
        id: 'entrees',
        label: 'Entrées ce mois',
        shortLabel: 'Entrées',
        value: entreesDisplay,
        icon: 'arrow-down-left' as const,
        tone: 'positive' as const,
        onPress: undefined,
      },
      {
        id: 'sorties',
        label: 'Sorties ce mois',
        shortLabel: 'Sorties',
        value: sortiesDisplay,
        icon: 'arrow-up-right' as const,
        tone: 'negative' as const,
        onPress: undefined,
      },
      {
        id: 'epargne',
        label: 'Mis de côté',
        shortLabel: 'Mis en épargne',
        value: epargneDisplay,
        icon: 'target' as const,
        // Progression positive : toujours vert, jamais neutre (loi de la couleur fonctionnelle).
        tone: 'positive' as const,
      },
      {
        id: 'tontine',
        label: 'Cotisations tontine',
        shortLabel: 'Engagements tontines',
        value: tontineDisplay,
        icon: 'users' as const,
        // Engagement à venir : orange (attention requise), pas gris neutre.
        tone: 'accent' as const,
      },
    ],
    [entreesDisplay, sortiesDisplay, epargneDisplay, tontineDisplay, router],
  );

  const statToneStyles = {
    positive: {
      iconBg: withOpacity(Colors.success, 0.12),
      iconColor: Colors.success,
      valueStyle: styles.statChipValuePos,
    },
    negative: {
      iconBg: withOpacity(Colors.danger, 0.12),
      iconColor: Colors.danger,
      valueStyle: styles.statChipValueNeg,
    },
    accent: {
      iconBg: withOpacity(Colors.accent, 0.12),
      iconColor: Colors.accent,
      valueStyle: styles.statChipValueAccent,
    },
    neutral: {
      iconBg: withOpacity(accentColor, 0.12),
      iconColor: accentColor,
      valueStyle: null,
    },
  } as const;

  const statPages = useMemo(() => {
    const pages: (typeof statCards)[] = [];
    for (let i = 0; i < statCards.length; i += 2) {
      pages.push(statCards.slice(i, i + 2));
    }
    return pages;
  }, [statCards]);

  const canScrollStatsForward = statPageIndex < statPages.length - 1;
  const canScrollStatsBack = statPageIndex > 0;

  const handleStatScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const page = Math.round(event.nativeEvent.contentOffset.x / screenWidth);
      setStatPageIndex(page);
    },
    [screenWidth],
  );

  const scrollStatsForward = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    const nextPage = Math.min(statPageIndex + 1, statPages.length - 1);
    statScrollRef.current?.scrollTo({ x: nextPage * screenWidth, animated: true });
    setStatPageIndex(nextPage);
  }, [statPageIndex, statPages.length, screenWidth]);

  const scrollStatsBack = useCallback(() => {
    Haptics.selectionAsync().catch(() => {});
    const prevPage = Math.max(statPageIndex - 1, 0);
    statScrollRef.current?.scrollTo({ x: prevPage * screenWidth, animated: true });
    setStatPageIndex(prevPage);
  }, [statPageIndex, screenWidth]);

  const renderStatChip = (stat: (typeof statCards)[number]) => {
    const tone = statToneStyles[stat.tone];
    const Chip = stat.onPress ? AnimatedPressable : View;
    return (
      <Chip
        key={stat.id}
        {...(stat.onPress ? { onPress: stat.onPress } : {})}
        style={styles.statChip}
        {...(stat.onPress
          ? { accessibilityRole: 'button' as const, accessibilityLabel: stat.label }
          : {})}
      >
        <View style={styles.statChipTopRow}>
          <View style={[styles.statChipIconCircle, { backgroundColor: tone.iconBg }]}>
            <Feather name={stat.icon} size={15} color={tone.iconColor} />
          </View>
          {stat.onPress ? (
            <Feather name="chevron-right" size={14} color={Colors.gray[300]} />
          ) : null}
        </View>
        <Text style={styles.statChipLabel}>{stat.shortLabel}</Text>
        <Text style={[styles.statChipValue, tone.valueStyle]}>
          {balanceVisible ? stat.value : '••••'}
        </Text>
      </Chip>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.topBar}>
          <View style={styles.topBarLeft}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{initials}</Text>
            </View>
            <View style={styles.greetingBlock}>
              <Text style={styles.greeting}>Bonjour, {greetingName}</Text>
              <Text style={styles.dateLine}>{dateLabel}</Text>
            </View>
          </View>
          <AnimatedPressable
            style={styles.bellButton}
            onPress={() => router.push('/notifications')}
            accessibilityRole="button"
            accessibilityLabel={
              unreadNotificationsCount > 0
                ? `Notifications, ${unreadNotificationsCount} non lues`
                : 'Notifications'
            }
          >
            <Feather name="bell" size={20} color={Colors.gray[700]} />
            {unreadNotificationsCount > 0 ? (
              <View style={styles.bellBadge}>
                <Text style={styles.bellBadgeText}>
                  {unreadNotificationsCount > 9 ? '9+' : String(unreadNotificationsCount)}
                </Text>
              </View>
            ) : null}
          </AnimatedPressable>
        </View>

        {showUrgentBanner && mostUrgentDeadline ? (
          <InfoBanner
            icon={mostUrgentDays === 0 ? 'alert-triangle' : 'clock'}
            tone={mostUrgentDays === 0 ? 'danger' : 'warning'}
            text={urgentBannerText}
            actionLabel={mostUrgentDeadline.kind === 'tontine' ? 'Payer maintenant' : 'Voir mon épargne'}
            onAction={() => {
              setUrgentBannerDismissed(true);
              if (mostUrgentDeadline.kind === 'tontine' && mostUrgentDeadline.tontineId) {
                router.push({
                  pathname: '/tontine-details',
                  params: { id: mostUrgentDeadline.tontineId, focus: 'payment' },
                });
              } else {
                router.push('/(tabs)/savings');
              }
            }}
          />
        ) : null}

        <View style={styles.walletHero}>
          <View style={styles.balanceCard}>
            <View style={styles.balanceCardOrbTop} pointerEvents="none" />
            <View style={styles.balanceCardOrbBottom} pointerEvents="none" />

            <View style={styles.balanceTopRow}>
              <View style={styles.balanceTopLeft}>
                <View style={styles.balanceAccountTagRow}>
                  <View style={styles.balanceAccountDot} />
                  <Text style={styles.balanceAccountTag}>Compte principal</Text>
                </View>
                <Text style={styles.balanceLabel}>Solde disponible</Text>
              </View>
              <AnimatedPressable
                style={styles.eyeButton}
                onPress={toggleBalanceVisible}
                accessibilityRole="button"
                accessibilityLabel={balanceVisible ? 'Masquer le solde' : 'Afficher le solde'}
              >
                <Feather name={balanceVisible ? 'eye' : 'eye-off'} size={15} color={Colors.white} />
              </AnimatedPressable>
            </View>

            <Animated.View style={[styles.balanceValueBlock, balanceAnimatedStyle]}>
              {balanceVisible ? (
                <>
                  <Text style={styles.balanceValue}>{balanceDisplay}</Text>
                  <Text style={styles.balanceCurrency}>FCFA</Text>
                </>
              ) : (
                <Text style={styles.balanceValue}>••••••</Text>
              )}
            </Animated.View>
          </View>

          <View style={styles.actionPillsRow}>
            <AnimatedPressable
              style={[styles.actionPill, styles.actionPillDeposit]}
              onPress={() => router.push('/deposit-to-account')}
              accessibilityRole="button"
              accessibilityLabel="Faire un dépôt"
            >
              <View style={styles.actionPillIconCircle}>
                <Feather name="plus" size={16} color={Colors.brand} />
              </View>
              <View style={styles.actionPillTexts}>
                <Text style={styles.actionPillLabel}>Dépôt</Text>
                <Text style={styles.actionPillHint}>Vers COTICI</Text>
              </View>
            </AnimatedPressable>
            <AnimatedPressable
              style={[styles.actionPill, styles.actionPillWithdraw]}
              onPress={() => router.push('/retrait')}
              accessibilityRole="button"
              accessibilityLabel="Faire un retrait"
            >
              <View style={[styles.actionPillIconCircle, styles.actionPillIconCircleWithdraw]}>
                <Feather name="arrow-up-right" size={15} color={Colors.success} />
              </View>
              <View style={styles.actionPillTexts}>
                <Text style={[styles.actionPillLabel, styles.actionPillLabelWithdraw]}>Retrait</Text>
                <Text style={styles.actionPillHintWithdraw}>Mobile Money</Text>
              </View>
            </AnimatedPressable>
          </View>

          <View style={styles.statsBlock}>
            <View style={styles.statsBlockHeader}>
              <Text style={styles.statsBlockTitle}>Ce mois</Text>
              {statPages.length > 1 ? (
                <Text style={styles.statsBlockHint}>
                  {statPageIndex + 1}/{statPages.length}
                </Text>
              ) : null}
            </View>
            <View style={styles.statCarouselWrap}>
              <ScrollView
                ref={statScrollRef}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                nestedScrollEnabled
                decelerationRate="fast"
                snapToInterval={screenWidth}
                snapToAlignment="start"
                disableIntervalMomentum
                onMomentumScrollEnd={handleStatScrollEnd}
                onScrollEndDrag={handleStatScrollEnd}
                style={styles.statCarousel}
              >
                {statPages.map((page, pageIndex) => (
                  <View
                    key={`stat-page-${pageIndex}`}
                    style={[
                      styles.statCarouselPage,
                      { width: screenWidth },
                      pageIndex === 0 &&
                        pageIndex < statPages.length - 1 &&
                        styles.statCarouselPageWithChevronRight,
                      pageIndex > 0 && styles.statCarouselPageWithChevronLeft,
                    ]}
                  >
                    {page.map((stat) => renderStatChip(stat))}
                  </View>
                ))}
              </ScrollView>
              {canScrollStatsBack ? (
                <AnimatedPressable
                  style={[styles.statCarouselChevron, styles.statCarouselChevronLeft]}
                  onPress={scrollStatsBack}
                  accessibilityRole="button"
                  accessibilityLabel="Voir les indicateurs précédents"
                >
                  <Feather name="chevron-left" size={18} color={Colors.gray[700]} />
                </AnimatedPressable>
              ) : null}
              {canScrollStatsForward ? (
                <AnimatedPressable
                  style={styles.statCarouselChevron}
                  onPress={scrollStatsForward}
                  accessibilityRole="button"
                  accessibilityLabel="Voir les indicateurs suivants"
                >
                  <Feather name="chevron-right" size={18} color={Colors.gray[700]} />
                </AnimatedPressable>
              ) : null}
            </View>
          </View>
        </View>

        <View style={styles.navLinks}>
          <AnimatedPressable
            style={styles.navLinkButton}
            onPress={() => router.push('/(tabs)/savings')} >
            <Feather name="target" size={20} color={accentColor} />
            <Text style={styles.navLinkText}>Voir mes objectifs</Text>
            <Feather name="chevron-right" size={18} color={Colors.gray[400]} />
          </AnimatedPressable>
          <AnimatedPressable
            style={styles.navLinkButton}
            onPress={() => router.push('/(tabs)/tontine')} >
            <Feather name="users" size={20} color={accentColor} />
            <Text style={styles.navLinkText}>Voir mes tontines</Text>
            <Feather name="chevron-right" size={18} color={Colors.gray[400]} />
          </AnimatedPressable>
          {upcomingCount > 0 ? (
            <AnimatedPressable
              style={styles.navLinkButton}
              onPress={() => router.push('/prochaines-echeances')} >
              <Feather name="clock" size={20} color={accentColor} />
              <Text style={styles.navLinkText}>Prochaines échéances</Text>
              <View style={styles.navLinkCountBadge}>
                <Text style={styles.navLinkCountText}>
                  {upcomingCount > 99 ? '99+' : String(upcomingCount)}
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={Colors.gray[400]} />
            </AnimatedPressable>
          ) : null}
        </View>

        <View style={styles.activityHeader}>
          <Text style={styles.activityTitle}>Activités récentes</Text>
          <AnimatedPressable onPress={() => router.push('/activites-recentes')}>
            <Text style={styles.seeAll}>Voir tout</Text>
          </AnimatedPressable>
        </View>

        {loadingActivities ? (
          <View style={styles.activitySkeletonList}>
            {[0, 1, 2].map((i) => (
              <Card key={i} variant="soft" style={styles.activitySkeletonCard}>
                <Skeleton shape="circle" width={40} height={40} />
                <View style={{ flex: 1, gap: 6 }}>
                  <Skeleton shape="text" width="50%" />
                  <Skeleton shape="text" width="30%" height={11} />
                </View>
                <Skeleton shape="text" width={60} height={14} />
              </Card>
            ))}
          </View>
        ) : recentActivities.length === 0 ? (
          <EmptyState
            icon="inbox"
            title="Aucune activité pour le moment"
            description="Vos dépôts, retraits et cotisations apparaîtront ici dès votre première action."
            actionLabel="Faire un dépôt"
            onAction={() => router.push('/deposit-to-account')}
          />
        ) : (
          recentActivities.map((activity) => {
            const tone = resolveActivityToneFromDetail(activity);
            const toneStyle = activityToneStyle(tone);
            return (
            <AnimatedPressable
              key={activity.id}
              onPress={() => router.push(`/activite/${activity.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`${activity.type}, ${activity.date}, ${formatActivityAmount(activity.amount, tone)}F`}
            >
              <Card variant="soft" style={styles.activityItem}>
                <View style={styles.activityLeft}>
                  <View
                    style={[
                      styles.activityIcon,
                      { backgroundColor: toneStyle.iconBg },
                    ]}
                  >
                    <Feather
                      name={toneStyle.icon}
                      size={20}
                      color={toneStyle.iconColor}
                    />
                  </View>
                  <View>
                    <Text style={styles.activityType}>{activity.type}</Text>
                    <Text style={styles.activityDate}>{activity.date}</Text>
                  </View>
                </View>
                <Text
                  style={[
                    styles.activityAmount,
                    { color: toneStyle.amountColor },
                  ]}
                >
                  {formatActivityAmount(activity.amount, tone)}F
                </Text>
              </Card>
            </AnimatedPressable>
            );
          })
        )}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.screen.bg },
  scrollContent: { paddingBottom: 100 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Theme.spacing.page,
    paddingVertical: Theme.spacing.sm,
    marginBottom: Theme.spacing.sm,
  },
  topBarLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  greetingBlock: { flex: 1 },
  greeting: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 20, color: Colors.gray[900] },
  dateLine: { fontFamily: Fonts.outfit.regular, fontSize: 13, color: Colors.gray[500], marginTop: 2 },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Theme.screen.surface,
    ...Theme.shadow.soft,
  },
  avatarText: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 18, color: Colors.white },
  bellButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Theme.screen.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...Theme.shadow.soft,
  },
  bellBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: Theme.screen.surface,
  },
  bellBadgeText: { fontFamily: Fonts.outfit.bold, fontSize: 10, color: Colors.white },
  walletHero: {
    marginBottom: Theme.spacing.lg,
  },
  balanceCard: {
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Colors.success,
    borderRadius: Theme.radius.xl,
    paddingTop: Theme.spacing.lg,
    paddingBottom: Theme.spacing.xl + 6,
    paddingHorizontal: Theme.spacing.lg,
    overflow: 'hidden',
    ...Theme.shadow.brandHero,
  },
  balanceCardOrbTop: {
    position: 'absolute',
    top: -36,
    right: -28,
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  balanceCardOrbBottom: {
    position: 'absolute',
    bottom: -48,
    left: -32,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  balanceTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: Theme.spacing.md,
  },
  balanceTopLeft: { flex: 1, paddingRight: Theme.spacing.sm },
  balanceAccountTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  balanceAccountDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  balanceAccountTag: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 10,
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  balanceLabel: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: 'rgba(255,255,255,0.9)' },
  eyeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.14)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  balanceValueBlock: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    flexWrap: 'wrap',
  },
  balanceValue: {
    fontFamily: Fonts.spaceGrotesk.bold,
    fontSize: 34,
    color: Colors.white,
    letterSpacing: -0.5,
    lineHeight: 40,
  },
  balanceCurrency: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 15,
    color: 'rgba(255,255,255,0.75)',
    marginBottom: 2,
  },
  balanceEpargneHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Theme.spacing.md,
    alignSelf: 'flex-start',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: Theme.radius.pill,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  balanceEpargneHintText: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
  },
  actionPillsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: Theme.spacing.page,
    gap: 10,
    marginTop: -22,
    marginBottom: Theme.spacing.lg,
    zIndex: 2,
  },
  actionPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: Theme.radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 14,
    ...Theme.shadow.card,
  },
  actionPillDeposit: {
    backgroundColor: Colors.brand,
  },
  actionPillWithdraw: {
    backgroundColor: Theme.screen.surface,
    borderWidth: 1,
    borderColor: Colors.gray[100],
  },
  actionPillIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPillIconCircleWithdraw: {
    backgroundColor: withOpacity(Colors.success, 0.1),
  },
  actionPillTexts: {
    flex: 1,
    gap: 1,
  },
  actionPillLabel: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 15,
    color: Colors.white,
  },
  actionPillLabelWithdraw: {
    color: Colors.gray[900],
  },
  actionPillHint: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
  },
  actionPillHintWithdraw: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 11,
    color: Colors.gray[500],
  },
  statsBlock: {
    gap: Theme.spacing.sm,
  },
  statsBlockHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: Theme.spacing.page,
  },
  statsBlockTitle: {
    fontFamily: Fonts.spaceGrotesk.bold,
    fontSize: 17,
    color: Colors.gray[900],
  },
  statsBlockHint: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 12,
    color: Colors.gray[400],
  },
  statCarouselWrap: {
    position: 'relative',
  },
  statCarousel: {
    overflow: 'hidden',
  },
  statCarouselPage: {
    flexDirection: 'row',
    paddingHorizontal: Theme.spacing.page,
    gap: 10,
  },
  statCarouselPageWithChevronRight: {
    paddingRight: Theme.spacing.page + 30,
  },
  statCarouselPageWithChevronLeft: {
    paddingLeft: Theme.spacing.page + 30,
  },
  statCarouselChevron: {
    position: 'absolute',
    right: Theme.spacing.page - 6,
    top: '50%',
    marginTop: -18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Theme.screen.surface,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
    ...Theme.shadow.soft,
  },
  statCarouselChevronLeft: {
    right: undefined,
    left: Theme.spacing.page - 6,
  },
  statChip: {
    flex: 1,
    backgroundColor: Theme.screen.surface,
    borderRadius: Theme.radius.lg,
    padding: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    ...Theme.shadow.soft,
  },
  statChipTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Theme.spacing.sm,
  },
  statChipIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statChipLabel: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 12,
    color: Colors.gray[500],
    marginBottom: 4,
  },
  statChipValue: {
    fontFamily: Fonts.spaceGrotesk.bold,
    fontSize: 15,
    color: Colors.gray[900],
  },
  statChipValuePos: { color: Colors.success },
  statChipValueNeg: { color: Colors.danger },
  statChipValueAccent: { color: Colors.accent },
  navLinks: { paddingHorizontal: Theme.spacing.page, gap: Theme.spacing.md, marginBottom: Theme.spacing.xl },
  navLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.md,
    paddingVertical: 14,
    paddingHorizontal: Theme.spacing.lg,
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Theme.screen.surface,
    ...Theme.shadow.soft,
  },
  navLinkText: { flex: 1, fontFamily: Fonts.outfit.medium, fontSize: 15, color: Colors.gray[900] },
  navLinkCountBadge: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 7,
    borderRadius: 12,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navLinkCountText: {
    fontFamily: Fonts.outfit.bold,
    fontSize: 12,
    color: Colors.white,
  },
  activityHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.md,
  },
  activityTitle: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 20, color: Colors.gray[900] },
  seeAll: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.success },
  activityItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.sm,
  },
  activityLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  activityIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  activityType: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[900] },
  activityDate: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500] },
  activityAmount: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 14 },
  activitySkeletonList: { paddingHorizontal: Theme.spacing.page, gap: Theme.spacing.sm },
  activitySkeletonCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
