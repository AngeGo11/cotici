import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/constants/Colors';
import { Fonts } from '@/constants/Fonts';
import { Theme } from '@/constants/Theme';
import { RECENT_ACTIVITIES } from '@/data/recentActivities';
import { UPCOMING_DEADLINES } from '@/data/upcomingDeadlines';

const USER_FIRST_NAME = 'Jean';

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
  const [balanceVisible, setBalanceVisible] = useState(true);
  const dateLabel = formatTodayFr();
  const upcomingCount = UPCOMING_DEADLINES.length;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <View style={styles.topBar}>
          <View style={styles.topBarLeft}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>JD</Text>
            </View>
            <View style={styles.greetingBlock}>
              <Text style={styles.greeting}>Bonjour, {USER_FIRST_NAME}</Text>
              <Text style={styles.dateLine}>{dateLabel}</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.bellButton}>
            <Feather name="bell" size={20} color={Colors.gray[700]} />
            <View style={styles.bellDot} />
          </TouchableOpacity>
        </View>

        <View style={styles.balanceCard}>
          <Text style={styles.balanceAccountTag}>Compte principal</Text>
          <View style={styles.balanceHeader}>
            <Text style={styles.balanceLabel}>Solde disponible</Text>
            <TouchableOpacity
              style={styles.eyeButton}
              onPress={() => setBalanceVisible(!balanceVisible)}
            >
              <Feather name={balanceVisible ? 'eye' : 'eye-off'} size={16} color={Colors.white} />
            </TouchableOpacity>
          </View>
          <View>
            {balanceVisible ? (
              <Text style={styles.balanceValue}>
                487.000 <Text style={styles.balanceCurrency}>FCFA</Text>
              </Text>
            ) : (
              <Text style={styles.balanceValue}>••••••</Text>
            )}
            <Text style={styles.balanceChange}>+25.000 FCFA ce mois</Text>
          </View>

          <View style={styles.balanceDivider} />

          <View style={styles.balanceFootRow}>
            <View style={styles.balanceFootCol}>
              <Text style={styles.balanceFootLabel}>Entrées ce mois</Text>
              <Text style={styles.balanceFootValuePos}>
                {balanceVisible ? '+75.000 F' : '••••'}
              </Text>
            </View>
            <View style={styles.balanceFootSep} />
            <View style={styles.balanceFootCol}>
              <Text style={styles.balanceFootLabel}>Sorties ce mois</Text>
              <Text style={styles.balanceFootValueNeg}>
                {balanceVisible ? '−35.000 F' : '••••'}
              </Text>
            </View>
          </View>
        </View>

        <Text style={styles.quickActionsTitle}>Mon argent</Text>
        <View style={styles.quickActionsCard}>
          <TouchableOpacity
            style={styles.quickActionHalf}
            onPress={() => router.push('/deposit-to-account')}
            activeOpacity={0.7}
          >
            <View style={[styles.quickActionIconSm, { backgroundColor: withOpacity(Colors.brand, 0.12) }]}>
              <Feather name="arrow-down-left" size={22} color={Colors.brand} />
            </View>
            <View style={styles.quickActionTexts}>
              <Text style={styles.quickActionTitle}>Dépôt</Text>
              <Text style={styles.quickActionHint}>Vers votre solde COTICI</Text>
            </View>
          </TouchableOpacity>
          <View style={styles.quickActionsSep} />
          <TouchableOpacity
            style={styles.quickActionHalf}
            onPress={() => router.push('/retrait')}
            activeOpacity={0.7}
          >
            <View style={[styles.quickActionIconSm, { backgroundColor: withOpacity(Colors.success, 0.12) }]}>
              <Feather name="arrow-up-right" size={22} color={Colors.success} />
            </View>
            <View style={styles.quickActionTexts}>
              <Text style={styles.quickActionTitle}>Retrait</Text>
              <Text style={styles.quickActionHint}>Vers Mobile Money</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.navLinks}>
          <TouchableOpacity
            style={styles.navLinkButton}
            onPress={() => router.push('/(tabs)/savings')}
            activeOpacity={0.7}
          >
            <Feather name="target" size={20} color={Colors.brand} />
            <Text style={styles.navLinkText}>Voir mes objectifs</Text>
            <Feather name="chevron-right" size={18} color={Colors.gray[400]} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.navLinkButton}
            onPress={() => router.push('/(tabs)/tontine')}
            activeOpacity={0.7}
          >
            <Feather name="users" size={20} color={Colors.brand} />
            <Text style={styles.navLinkText}>Voir mes tontines</Text>
            <Feather name="chevron-right" size={18} color={Colors.gray[400]} />
          </TouchableOpacity>
          {upcomingCount > 0 ? (
            <TouchableOpacity
              style={styles.navLinkButton}
              onPress={() => router.push('/prochaines-echeances')}
              activeOpacity={0.7}
            >
              <Feather name="clock" size={20} color={Colors.brand} />
              <Text style={styles.navLinkText}>Prochaines échéances</Text>
              <View style={styles.navLinkCountBadge}>
                <Text style={styles.navLinkCountText}>
                  {upcomingCount > 99 ? '99+' : String(upcomingCount)}
                </Text>
              </View>
              <Feather name="chevron-right" size={18} color={Colors.gray[400]} />
            </TouchableOpacity>
          ) : null}
        </View>

        <View style={styles.activityHeader}>
          <Text style={styles.activityTitle}>Activités récentes</Text>
          <TouchableOpacity onPress={() => router.push('/activites-recentes')}>
            <Text style={styles.seeAll}>Voir tout</Text>
          </TouchableOpacity>
        </View>

        {RECENT_ACTIVITIES.map((activity) => (
          <TouchableOpacity
            key={activity.id}
            style={styles.activityItem}
            onPress={() => router.push(`/activite/${activity.id}`)}
            activeOpacity={0.7}
          >
            <View style={styles.activityLeft}>
              <View style={[styles.activityIcon, {
                backgroundColor: activity.amount > 0 ? withOpacity(Colors.success, 0.1) : withOpacity(Colors.danger, 0.06),
              }]}>
                <Feather
                  name={activity.amount > 0 ? 'arrow-down-left' : 'arrow-up-right'}
                  size={20}
                  color={activity.amount > 0 ? Colors.success : Colors.danger}
                />
              </View>
              <View>
                <Text style={styles.activityType}>{activity.type}</Text>
                <Text style={styles.activityDate}>{activity.date}</Text>
              </View>
            </View>
            <Text style={[styles.activityAmount, {
              color: activity.amount > 0 ? Colors.success : Colors.danger,
            }]}>
              {activity.amount > 0 ? '+' : ''}{activity.amount.toLocaleString('fr-FR')}F
            </Text>
          </TouchableOpacity>
        ))}

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
    backgroundColor: Colors.brand,
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
  bellDot: { position: 'absolute', top: 10, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.danger },
  balanceCard: {
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Colors.brand,
    borderRadius: Theme.radius.xl,
    padding: Theme.spacing.xl,
    marginBottom: Theme.spacing.lg,
    ...Theme.shadow.brandHero,
  },
  balanceAccountTag: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 0.8,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  balanceHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  balanceLabel: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: 'rgba(255,255,255,0.85)' },
  eyeButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.1)', alignItems: 'center', justifyContent: 'center' },
  balanceValue: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 36, color: Colors.white },
  balanceCurrency: { fontSize: 20 },
  balanceChange: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: 'rgba(255,255,255,0.75)', marginTop: 6 },
  balanceDivider: { height: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginTop: 20, marginBottom: 16 },
  balanceFootRow: { flexDirection: 'row', alignItems: 'stretch' },
  balanceFootCol: { flex: 1 },
  balanceFootSep: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 12 },
  balanceFootLabel: { fontFamily: Fonts.outfit.regular, fontSize: 11, color: 'rgba(255,255,255,0.65)', marginBottom: 4 },
  balanceFootValuePos: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 16, color: 'rgba(255,255,255,0.95)' },
  balanceFootValueNeg: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 16, color: 'rgba(255,255,255,0.95)' },
  quickActionsTitle: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 13,
    color: Colors.gray[500],
    paddingHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.md,
    letterSpacing: 0.2,
  },
  quickActionsCard: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.xl,
    backgroundColor: Theme.screen.surface,
    borderRadius: Theme.radius.lg,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    overflow: 'hidden',
    ...Theme.shadow.card,
  },
  quickActionHalf: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, paddingHorizontal: 14 },
  quickActionsSep: { width: 1, backgroundColor: Colors.gray[100], alignSelf: 'stretch', marginVertical: 12 },
  quickActionIconSm: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  quickActionTexts: { flex: 1 },
  quickActionTitle: { fontFamily: Fonts.outfit.medium, fontSize: 16, color: Colors.gray[900], marginBottom: 2 },
  quickActionHint: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500], lineHeight: 16 },
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
  seeAll: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.brand },
  activityItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Theme.screen.surface,
    borderRadius: Theme.radius.md,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.sm,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    ...Theme.shadow.soft,
  },
  activityLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  activityIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  activityType: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[900] },
  activityDate: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500] },
  activityAmount: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 14 },
});
