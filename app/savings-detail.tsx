import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Svg, Circle } from 'react-native-svg';
import { Colors, withOpacity } from '@/constants/Colors';
import { Fonts } from '@/constants/Fonts';
import { Theme } from '@/constants/Theme';
import { SAVINGS_CONTRIBUTIONS } from '@/data/savingsContributions';

const savedAmount = 325000;
const goalAmount = 500000;
const percentage = Math.round((savedAmount / goalAmount) * 100);
const size = 200;
const strokeWidth = 14;
const radius = (size - strokeWidth) / 2;
const circumference = 2 * Math.PI * radius;
const progressOffset = ((100 - percentage) / 100) * circumference;

const contributionsPreview = SAVINGS_CONTRIBUTIONS.slice(0, 3);

export default function SavingsDetailScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.historyPill}
            activeOpacity={0.85}
            onPress={() => router.push('/savings-history')}
          >
            <Feather name="clock" size={16} color={Colors.brand} />
            <Text style={styles.historyLink}>Historique</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.heroBlock}>
          <View style={styles.titleIcon}>
            <Feather name="target" size={26} color={Colors.success} />
          </View>
          <Text style={styles.title}>{"Mon objectif d'épargne"}</Text>
          <Text style={styles.subtitle}>Nouveau Projet</Text>
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
              <Text style={styles.amountValue}>{savedAmount.toLocaleString('fr-FR')} F</Text>
            </View>
            <View style={styles.trendIcon}>
              <Feather name="trending-up" size={22} color={Colors.success} />
            </View>
          </View>
          <View style={styles.separator} />
          <View style={styles.amountRow}>
            <View>
              <Text style={styles.amountLabel}>Objectif</Text>
              <Text style={styles.amountValueDark}>{goalAmount.toLocaleString('fr-FR')} F</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.amountLabel}>Restant</Text>
              <Text style={styles.amountValueBrand}>{(goalAmount - savedAmount).toLocaleString('fr-FR')} F</Text>
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
            <Text style={styles.statValue}>6 mois</Text>
            <Text style={styles.statSub}>3 mois restants</Text>
          </View>
          <View style={styles.statCard}>
            <View style={styles.statIconRow}>
              <Feather name="trending-up" size={16} color={Colors.brand} />
              <Text style={styles.statLabel}>Mensuel</Text>
            </View>
            <Text style={styles.statValue}>83.333 F</Text>
            <Text style={styles.statSub}>À épargner</Text>
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push('/add-to-savings')}
            activeOpacity={0.9}
          >
            <Feather name="plus-circle" size={20} color={Colors.white} />
            <Text style={styles.addButtonText}>Ajouter de l&apos;argent</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => router.push('/modifier-objectif')}
            activeOpacity={0.85}
          >
            <Feather name="edit-2" size={18} color={Colors.gray[700]} />
            <Text style={styles.editButtonText}>Modifier l&apos;objectif</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionEyebrow}>Contributions récentes</Text>
        {contributionsPreview.map((c) => (
          <View key={c.id} style={styles.contributionItem}>
            <View style={styles.contribLeft}>
              <View style={styles.contribIcon}>
                <Feather name="arrow-down-left" size={18} color={Colors.success} />
              </View>
              <View>
                <Text style={styles.contributionType}>{c.label}</Text>
                <Text style={styles.contributionDate}>{c.date}</Text>
              </View>
            </View>
            <Text style={styles.contributionAmount}>+{c.amount.toLocaleString('fr-FR')} F</Text>
          </View>
        ))}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.screen.bg },
  scroll: { paddingBottom: 100 },
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
