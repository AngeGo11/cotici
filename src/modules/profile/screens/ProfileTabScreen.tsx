import { useCallback, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { AnimatedPressable } from '@/shared/ui';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';
import { useAuth, formatFcfaDots, getDisplayFullName, getUserInitials } from '@/shared/auth';

const settingsOptions = [
  { id: 'notifications', label: 'Notifications', description: 'Gérer vos alertes', icon: 'bell' as const, color: Colors.brand },
  { id: 'security', label: 'Sécurité', description: 'Code PIN et biométrie', icon: 'lock' as const, color: Colors.success },
  { id: 'help', label: 'Aide & Support', description: 'FAQ et contact', icon: 'help-circle' as const, color: Colors.info },
  { id: 'terms', label: "Conditions d'utilisation", description: 'Politique de confidentialité', icon: 'file-text' as const, color: Colors.gray[600] },
];

const CARDS_PER_PAGE = 3;

type ActivityStat = {
  id: string;
  value: string;
  label: string;
  icon: ComponentProps<typeof Feather>['name'];
  borderColor: string;
  iconColor: string;
  valueColor: string;
};

type ActivityPage = {
  theme: 'tontines' | 'epargnes';
  title: string;
  cards: ActivityStat[];
};

const tontineActivityStats: ActivityStat[] = [
  {
    id: 'tontines-created',
    value: '3',
    label: 'Créées',
    icon: 'users',
    borderColor: Colors.brand,
    iconColor: Colors.brand,
    valueColor: Colors.brand,
  },
  {
    id: 'tontines-joined',
    value: '2',
    label: 'Rejointes',
    icon: 'user-plus',
    borderColor: Colors.brand,
    iconColor: Colors.brand,
    valueColor: Colors.brand,
  },
  {
    id: 'tontines-archived',
    value: '2',
    label: 'Archivées',
    icon: 'archive',
    borderColor: Colors.brand,
    iconColor: Colors.brand,
    valueColor: Colors.brand,
  },
  {
    id: 'tontines-deleted',
    value: '2',
    label: 'Supprimées',
    icon: 'trash-2',
    borderColor: Colors.brand,
    iconColor: Colors.brand,
    valueColor: Colors.brand,
  },
];

const savingsActivityStats: ActivityStat[] = [
  {
    id: 'savings-goals',
    value: '2',
    label: "Objectifs actifs",
    icon: 'target',
    borderColor: Colors.success,
    iconColor: Colors.success,
    valueColor: Colors.success,
  },
  {
    id: 'savings-archived',
    value: '2',
    label: 'Archivées',
    icon: 'archive',
    borderColor: Colors.success,
    iconColor: Colors.success,
    valueColor: Colors.success,
  },
  {
    id: 'savings-deleted',
    value: '2',
    label: 'Supprimées',
    icon: 'trash-2',
    borderColor: Colors.success,
    iconColor: Colors.success,
    valueColor: Colors.success,
  },
];

function chunkStats(stats: ActivityStat[], perPage: number): ActivityStat[][] {
  const pages: ActivityStat[][] = [];
  for (let i = 0; i < stats.length; i += perPage) {
    pages.push(stats.slice(i, i + perPage));
  }
  return pages;
}

function buildActivityPages(): ActivityPage[] {
  const pages: ActivityPage[] = [];

  const tontineChunks = chunkStats(tontineActivityStats, CARDS_PER_PAGE);
  tontineChunks.forEach((cards, index) => {
    pages.push({
      theme: 'tontines',
      title:
        tontineChunks.length > 1
          ? `Tontines (${index + 1}/${tontineChunks.length})`
          : 'Tontines',
      cards,
    });
  });

  const savingsChunks = chunkStats(savingsActivityStats, CARDS_PER_PAGE);
  savingsChunks.forEach((cards, index) => {
    pages.push({
      theme: 'epargnes',
      title:
        savingsChunks.length > 1
          ? `Épargne (${index + 1}/${savingsChunks.length})`
          : 'Épargne',
      cards,
    });
  });

  return pages;
}

const activityPagesStatic = buildActivityPages();

export default function ProfileScreen() {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const activityScrollRef = useRef<ScrollView>(null);
  const [activityPageIndex, setActivityPageIndex] = useState(0);
  const { user } = useAuth();
  const displayName = getDisplayFullName(user) || 'Membre COTICI';
  const phoneLine = user?.numero_telephone ?? '—';
  const dateJoined = user?.date_joined ?? '—';
  const initials = getUserInitials(user);
  const solde = formatFcfaDots(user?.solde_courant);

  const activityPages = activityPagesStatic;
  const currentActivityPage = activityPages[activityPageIndex];

  const canScrollActivityForward = activityPageIndex < activityPages.length - 1;
  const canScrollActivityBack = activityPageIndex > 0;

  const handleActivityScrollEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const page = Math.round(event.nativeEvent.contentOffset.x / screenWidth);
      setActivityPageIndex(page);
    },
    [screenWidth],
  );

  const scrollActivityForward = useCallback(() => {
    const nextPage = Math.min(activityPageIndex + 1, activityPages.length - 1);
    activityScrollRef.current?.scrollTo({ x: nextPage * screenWidth, animated: true });
    setActivityPageIndex(nextPage);
  }, [activityPageIndex, activityPages.length, screenWidth]);

  const scrollActivityBack = useCallback(() => {
    const prevPage = Math.max(activityPageIndex - 1, 0);
    activityScrollRef.current?.scrollTo({ x: prevPage * screenWidth, animated: true });
    setActivityPageIndex(prevPage);
  }, [activityPageIndex, screenWidth]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.topIntro}>
          <Text style={styles.pageTitle}>Mon profil</Text>
          <Text style={styles.pageSubtitle}>Votre identité et vos préférences COTICI</Text>
        </View>

        <View style={styles.userCard}>
          <Text style={styles.userTag}>Compte COTICI</Text>
          <View style={styles.userRow}>
            <View style={styles.userAvatar}>
              <Text style={styles.userAvatarText}>{initials}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.userName}>{displayName}</Text>
              <Text style={styles.userPhone}>{phoneLine}</Text>
            </View>
            <AnimatedPressable style={styles.editHint} onPress={() => router.push('/edit-profile')}>
              <Feather name="edit-3" size={18} color="rgba(255,255,255,0.9)" />
            </AnimatedPressable>
          </View>
          <View style={styles.balanceBox}>
            <View>
              <Text style={styles.balanceLabel}>Solde total</Text>
              <Text style={styles.balanceValue}>{solde} F</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.balanceLabel}>Membre depuis</Text>
              <Text style={styles.memberSince}>{dateJoined}</Text>
            </View>
          </View>
        </View>

        <View style={styles.activityBlock}>
          <View style={styles.activityBlockHeader}>
            <Text style={styles.sectionEyebrow}>Activité</Text>
            {activityPages.length > 0 ? (
              <Text style={styles.activityBlockHint}>
                {currentActivityPage?.title ?? 'Activité'}
                {activityPages.length > 1
                  ? ` · ${activityPageIndex + 1}/${activityPages.length}`
                  : ''}
              </Text>
            ) : null}
          </View>
          <View style={styles.statCarouselWrap}>
            <ScrollView
              ref={activityScrollRef}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              nestedScrollEnabled
              decelerationRate="fast"
              snapToInterval={screenWidth}
              snapToAlignment="start"
              disableIntervalMomentum
              onMomentumScrollEnd={handleActivityScrollEnd}
              onScrollEndDrag={handleActivityScrollEnd}
              style={styles.statCarousel}
            >
              {activityPages.map((page, pageIndex) => (
                <View
                  key={`activity-page-${pageIndex}`}
                  style={[
                    styles.statCarouselPage,
                    { width: screenWidth },
                    pageIndex === 0 &&
                      pageIndex < activityPages.length - 1 &&
                      styles.statCarouselPageWithChevronRight,
                    pageIndex > 0 && styles.statCarouselPageWithChevronLeft,
                  ]}
                >
                  {page.cards.map((stat) => (
                    <View
                      key={stat.id}
                      style={[styles.statCard, { borderTopColor: stat.borderColor }]}
                    >
                      <View
                        style={[
                          styles.statIconBg,
                          { backgroundColor: withOpacity(stat.iconColor, 0.12) },
                        ]}
                      >
                        <Feather name={stat.icon} size={18} color={stat.iconColor} />
                      </View>
                      <Text style={[styles.statValue, { color: stat.valueColor }]}>
                        {stat.value}
                      </Text>
                      <Text style={styles.statLabel} numberOfLines={2}>
                        {stat.label}
                      </Text>
                    </View>
                  ))}
                  {Array.from({ length: CARDS_PER_PAGE - page.cards.length }).map((_, i) => (
                    <View key={`activity-slot-${pageIndex}-${i}`} style={styles.statCardSlot} />
                  ))}
                </View>
              ))}
            </ScrollView>
            {canScrollActivityBack ? (
              <AnimatedPressable
                style={[styles.statCarouselChevron, styles.statCarouselChevronLeft]}
                onPress={scrollActivityBack}
                accessibilityRole="button"
                accessibilityLabel="Voir les indicateurs précédents"
              >
                <Feather name="chevron-left" size={18} color={Colors.gray[700]} />
              </AnimatedPressable>
            ) : null}
            {canScrollActivityForward ? (
              <AnimatedPressable
                style={styles.statCarouselChevron}
                onPress={scrollActivityForward}
                accessibilityRole="button"
                accessibilityLabel="Voir les indicateurs suivants"
              >
                <Feather name="chevron-right" size={18} color={Colors.gray[700]} />
              </AnimatedPressable>
            ) : null}
          </View>
        </View>

        <Text style={[styles.sectionEyebrow, styles.sectionEyebrowStandalone]}>Paramètres</Text>
        <View style={styles.settingsBlock}>
          {settingsOptions.map((option) => (
            <AnimatedPressable
              key={option.id}
              style={styles.settingsItem} onPress={() => {
                if (option.id === 'notifications') router.push('/notifications');
                else if (option.id === 'security') router.push('/security');
                else if (option.id === 'help') router.push('/help-support');
                else if (option.id === 'terms') router.push('/terms');
              }}
            >
              <View style={styles.settingsLeft}>
                <View style={[styles.settingsIcon, { backgroundColor: withOpacity(option.color, 0.1) }]}>
                  <Feather name={option.icon} size={20} color={option.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingsLabel}>{option.label}</Text>
                  <Text style={styles.settingsDesc}>{option.description}</Text>
                </View>
              </View>
              <Feather name="chevron-right" size={20} color={Colors.gray[400]} />
            </AnimatedPressable>
          ))}
        </View>

        <AnimatedPressable style={styles.logoutButton} onPress={() => router.replace('/')} >
          <Feather name="log-out" size={20} color={Colors.danger} />
          <Text style={styles.logoutText}>Se déconnecter</Text>
        </AnimatedPressable>

        <Text style={styles.version}>COTICI v1.0.2</Text>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.screen.bg },
  scroll: { paddingBottom: 100 },
  topIntro: { paddingHorizontal: Theme.spacing.page, paddingTop: Theme.spacing.sm, marginBottom: Theme.spacing.lg },
  pageTitle: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 28, color: Colors.gray[900], marginBottom: 6 },
  pageSubtitle: { fontFamily: Fonts.outfit.regular, fontSize: 15, color: Colors.gray[600], lineHeight: 22 },
  userCard: {
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Colors.brand,
    borderRadius: Theme.radius.xl,
    padding: Theme.spacing.xl,
    marginBottom: Theme.spacing.xl,
    ...Theme.shadow.brandHero,
  },
  userTag: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 0.8,
    marginBottom: Theme.spacing.md,
    textTransform: 'uppercase',
  },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: Theme.spacing.md, marginBottom: Theme.spacing.lg },
  userAvatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  userAvatarText: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 24, color: Colors.white },
  userName: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 22, color: Colors.white, marginBottom: 4 },
  userPhone: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: 'rgba(255,255,255,0.85)' },
  editHint: { padding: 8 },
  balanceBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: Theme.radius.md,
    padding: Theme.spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  balanceLabel: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: 'rgba(255,255,255,0.8)', marginBottom: 4 },
  balanceValue: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 26, color: Colors.white },
  memberSince: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.white },
  sectionEyebrow: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 13,
    color: Colors.gray[500],
    letterSpacing: 0.2,
  },
  sectionEyebrowStandalone: {
    paddingHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.md,
  },
  activityBlock: {
    gap: Theme.spacing.sm,
    marginBottom: Theme.spacing.xl,
  },
  activityBlockHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.md,
  },
  activityBlockHint: {
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
  statCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: Theme.screen.surface,
    borderRadius: Theme.radius.md,
    paddingVertical: Theme.spacing.md,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gray[100],
    borderTopWidth: 3,
    ...Theme.shadow.card,
  },
  statCardSlot: {
    flex: 1,
    minWidth: 0,
  },
  statIconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  statValue: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 20, marginBottom: 2 },
  statLabel: { fontFamily: Fonts.outfit.regular, fontSize: 10, color: Colors.gray[600], textAlign: 'center' },
  settingsBlock: { paddingHorizontal: Theme.spacing.page, marginBottom: Theme.spacing.lg },
  settingsItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Theme.screen.surface,
    borderRadius: Theme.radius.md,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    ...Theme.shadow.soft,
  },
  settingsLeft: { flexDirection: 'row', alignItems: 'center', gap: Theme.spacing.md, flex: 1 },
  settingsIcon: { width: 44, height: 44, borderRadius: Theme.radius.sm, alignItems: 'center', justifyContent: 'center' },
  settingsLabel: { fontFamily: Fonts.outfit.medium, fontSize: 15, color: Colors.gray[900], marginBottom: 2 },
  settingsDesc: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500] },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Theme.screen.surface,
    paddingVertical: 16,
    borderRadius: Theme.radius.md,
    marginBottom: Theme.spacing.lg,
    borderWidth: 1,
    borderColor: withOpacity(Colors.danger, 0.25),
    ...Theme.shadow.soft,
  },
  logoutText: { fontFamily: Fonts.outfit.medium, fontSize: 16, color: Colors.danger },
  version: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[400], textAlign: 'center' },
});
