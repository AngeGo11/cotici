import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { AnimatedPressable } from '@/shared/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Svg, Circle } from 'react-native-svg';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';
import { useSavingsDetail } from '@/modules/savings/hooks/useSavingsDetail';

const size = 200;
const strokeWidth = 14;
const radius = (size - strokeWidth) / 2;
const circumference = 2 * Math.PI * radius;

export default function SavingsDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { detail, loading, error } = useSavingsDetail(id);

  const percentage = detail?.percentage ?? 0;
  const progressOffset = ((100 - percentage) / 100) * circumference;

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.brand} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !detail) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <AnimatedPressable style={styles.backButton} onPress={() => router.back()}>
            <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
          </AnimatedPressable>
        </View>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error ?? 'Objectif introuvable.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <AnimatedPressable style={styles.backButton} onPress={() => router.back()}>
            <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
          </AnimatedPressable>
          <AnimatedPressable
            style={styles.historyPill}
            onPress={() => router.push({ pathname: '/savings-history', params: { id: detail.id } })}
          >
            <Feather name="clock" size={16} color={Colors.brand} />
            <Text style={styles.historyLink}>Historique</Text>
          </AnimatedPressable>
        </View>

        <View style={styles.heroBlock}>
          <View style={styles.titleIcon}>
            <Feather name="target" size={26} color={Colors.success} />
          </View>
          <Text style={styles.title}>{detail.name}</Text>
          {detail.category ? <Text style={styles.subtitle}>{detail.category}</Text> : null}
        </View>

        <View style={styles.progressShell}>
          <View style={styles.circleWrap}>
            <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
              <Circle cx={size / 2} cy={size / 2} r={radius} stroke={Colors.gray[100]} strokeWidth={strokeWidth} fill="none" />
              <Circle
                cx={size / 2}
                cy={size / 2}
                r={radius}
                stroke={Colors.success}
                strokeWidth={strokeWidth}
                fill="none"
                strokeDasharray={`${circumference}`}
                strokeDashoffset={`${progressOffset}`}
                strokeLinecap="round"
              />
            </Svg>
            <View style={styles.circleCenter}>
              <Text style={styles.percentageText}>{percentage}%</Text>
              <Text style={styles.completedText}>atteint</Text>
            </View>
          </View>
        </View>

        <View style={styles.amountCard}>
          <View style={styles.amountRow}>
            <View>
              <Text style={styles.amountLabel}>Montant épargné</Text>
              <Text style={styles.amountValue}>{detail.saved.toLocaleString('fr-FR')} F</Text>
            </View>
            <View style={styles.trendIcon}>
              <Feather name="trending-up" size={22} color={Colors.success} />
            </View>
          </View>
          <View style={styles.separator} />
          <View style={styles.amountRow}>
            <View>
              <Text style={styles.amountLabel}>Objectif</Text>
              <Text style={styles.amountValueDark}>{detail.target.toLocaleString('fr-FR')} F</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.amountLabel}>Restant</Text>
              <Text style={styles.amountValueBrand}>{detail.remaining.toLocaleString('fr-FR')} F</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionEyebrow}>Planning</Text>
        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <View style={styles.statIconRow}>
              <Feather name="calendar" size={16} color={Colors.success} />
              <Text style={styles.statLabel}>Durée</Text>
            </View>
            <Text style={styles.statValue}>
              {detail.durationMonths} mois
            </Text>
            <Text style={styles.statSub}>
              {detail.monthsRemaining > 0
                ? `${detail.monthsRemaining} mois restants`
                : 'Durée écoulée'}
            </Text>
          </View>
          <View style={styles.statCard}>
            <View style={styles.statIconRow}>
              <Feather name="trending-up" size={16} color={Colors.brand} />
              <Text style={styles.statLabel}>Mensuel</Text>
            </View>
            <Text style={styles.statValue}>
              {detail.monthlyAmount.toLocaleString('fr-FR')} F
            </Text>
            <Text style={styles.statSub}>À épargner</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <AnimatedPressable
            style={styles.addButton}
            onPress={() => router.push({ pathname: '/add-to-savings', params: { id: detail.id } })}
          >
            <Feather name="plus-circle" size={20} color={Colors.white} />
            <Text style={styles.addButtonText}>Ajouter de l&apos;argent</Text>
          </AnimatedPressable>
          <AnimatedPressable
            style={styles.editButton}
            onPress={() => router.push({ pathname: '/modifier-objectif', params: { id: detail.id } })}
          >
            <Feather name="edit-2" size={18} color={Colors.gray[700]} />
            <Text style={styles.editButtonText}>Modifier l&apos;objectif</Text>
          </AnimatedPressable>
        </View>

        
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.screen.bg },
  scroll: { paddingBottom: 100 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Theme.spacing.page },
  errorText: { fontFamily: Fonts.outfit.medium, fontSize: 16, color: Colors.danger, textAlign: 'center' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Theme.spacing.page,
    paddingVertical: Theme.spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Theme.screen.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...Theme.shadow.soft,
  },
  historyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Theme.radius.pill,
    backgroundColor: Theme.screen.surface,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    ...Theme.shadow.soft,
  },
  historyLink: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.brand },
  heroBlock: {
    alignItems: 'center',
    paddingHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.lg,
  },
  titleIcon: {
    width: 64,
    height: 64,
    borderRadius: Theme.radius.lg,
    backgroundColor: withOpacity(Colors.success, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Theme.spacing.md,
  },
  title: {
    fontFamily: Fonts.spaceGrotesk.bold,
    fontSize: 26,
    color: Colors.gray[900],
    textAlign: 'center',
    marginBottom: 6,
  },
  subtitle: { fontFamily: Fonts.outfit.regular, fontSize: 16, color: Colors.gray[500], textAlign: 'center' },
  progressShell: {
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Theme.screen.surface,
    borderRadius: Theme.radius.xl,
    paddingVertical: Theme.spacing.xl,
    marginBottom: Theme.spacing.xl,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gray[100],
    ...Theme.shadow.card,
  },
  circleWrap: { width: size, height: size, alignItems: 'center', justifyContent: 'center' },
  circleCenter: { position: 'absolute', alignItems: 'center' },
  percentageText: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 44, color: Colors.success },
  completedText: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[500], marginTop: 2 },
  amountCard: {
    marginHorizontal: Theme.spacing.page,
    backgroundColor: withOpacity(Colors.success, 0.08),
    borderRadius: Theme.radius.xl,
    padding: Theme.spacing.xl,
    marginBottom: Theme.spacing.xl,
    borderWidth: 1,
    borderColor: withOpacity(Colors.success, 0.22),
    ...Theme.shadow.soft,
  },
  amountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  amountLabel: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[600], marginBottom: 4 },
  amountValue: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 24, color: Colors.success },
  amountValueDark: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 20, color: Colors.gray[900] },
  amountValueBrand: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 20, color: Colors.brand },
  trendIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: withOpacity(Colors.success, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  separator: { height: 1, backgroundColor: withOpacity(Colors.success, 0.2), marginVertical: Theme.spacing.lg },
  sectionEyebrow: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 13,
    color: Colors.gray[500],
    paddingHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.md,
    letterSpacing: 0.2,
  },
  statsRow: { flexDirection: 'row', gap: Theme.spacing.md, paddingHorizontal: Theme.spacing.page, marginBottom: Theme.spacing.xl },
  statCard: {
    flex: 1,
    backgroundColor: Theme.screen.surface,
    borderRadius: Theme.radius.md,
    padding: Theme.spacing.lg,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    ...Theme.shadow.soft,
  },
  statIconRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  statLabel: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[600] },
  statValue: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 18, color: Colors.gray[900] },
  statSub: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500], marginTop: 4 },
  actions: { paddingHorizontal: Theme.spacing.page, gap: Theme.spacing.md, marginBottom: Theme.spacing.xl },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.brand,
    paddingVertical: 16,
    borderRadius: Theme.radius.md,
    ...Theme.shadow.soft,
  },
  addButtonText: { fontFamily: Fonts.outfit.medium, fontSize: 16, color: Colors.white },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: Theme.radius.md,
    backgroundColor: Theme.screen.surface,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    ...Theme.shadow.soft,
  },
  editButtonText: { fontFamily: Fonts.outfit.medium, fontSize: 16, color: Colors.gray[700] },
  contributionItem: {
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
  contribLeft: { flexDirection: 'row', alignItems: 'center', gap: Theme.spacing.md },
  contribIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: withOpacity(Colors.success, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  contributionType: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.gray[900] },
  contributionDate: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500], marginTop: 2 },
  contributionAmount: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 15, color: Colors.success },
});
