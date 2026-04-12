import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Svg, Circle } from 'react-native-svg';
import { Colors, withOpacity } from '@/constants/Colors';
import { Fonts } from '@/constants/Fonts';
import { Theme } from '@/constants/Theme';

const goals = [
  { id: '1', name: 'Nouveau Projet', saved: 325000, target: 500000, icon: 'target' as const },
  { id: '2', name: 'Vacances Abidjan', saved: 120000, target: 300000, icon: 'sun' as const },
  { id: '3', name: "Fonds d'urgence", saved: 75000, target: 100000, icon: 'shield' as const },
];

function MiniProgress({ percentage }: { percentage: number }) {
  const size = 52;
  const sw = 5;
  const r = (size - sw) / 2;
  const c = 2 * Math.PI * r;
  const offset = ((100 - percentage) / 100) * c;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={Colors.gray[200]} strokeWidth={sw} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={Colors.success}
          strokeWidth={sw}
          fill="none"
          strokeDasharray={`${c}`}
          strokeDashoffset={`${offset}`}
          strokeLinecap="round"
        />
      </Svg>
      <Text style={styles.miniPct}>{percentage}%</Text>
    </View>
  );
}

function GoalBar({ pct }: { pct: number }) {
  return (
    <View style={styles.goalBarTrack}>
      <View style={[styles.goalBarFill, { width: `${Math.min(100, pct)}%` }]} />
    </View>
  );
}

export default function SavingsListScreen() {
  const router = useRouter();

  const totalSaved = goals.reduce((s, g) => s + g.saved, 0);
  const totalTarget = goals.reduce((s, g) => s + g.target, 0);
  const globalPct = Math.min(100, Math.round((totalSaved / totalTarget) * 100));

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.topRow}>
          <View style={styles.titleBlock}>
            <Text style={styles.pageTitle}>{"Mes objectifs d'épargne"}</Text>
            <Text style={styles.pageSubtitle}>
              Suivez vos projets et atteignez vos cibles pas à pas
            </Text>
          </View>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => router.push('/create-savings')}
            accessibilityLabel="Nouveau projet"
          >
            <Feather name="plus" size={22} color={Colors.white} />
          </TouchableOpacity>
        </View>

        <View style={styles.summaryHero}>
          <Text style={styles.summaryTag}>{"Vue d'ensemble"}</Text>
          <View style={styles.summaryRow}>
            <View>
              <Text style={styles.summaryLabel}>Épargné au total</Text>
              <Text style={styles.summaryValue}>{totalSaved.toLocaleString('fr-FR')} F</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.summaryLabel}>Objectif cumulé</Text>
              <Text style={styles.summaryTarget}>{totalTarget.toLocaleString('fr-FR')} F</Text>
            </View>
          </View>
          <View style={styles.globalBarTrack}>
            <View style={[styles.globalBarFill, { width: `${globalPct}%` }]} />
          </View>
          <Text style={styles.summaryHint}>{globalPct}% de vos objectifs cumulés est atteint</Text>
        </View>

        <Text style={styles.sectionEyebrow}>Par objectif</Text>

        {goals.map((goal) => {
          const pct = Math.round((goal.saved / goal.target) * 100);
          return (
            <TouchableOpacity
              key={goal.id}
              style={styles.goalCard}
              onPress={() => router.push('/savings-detail')}
              activeOpacity={0.85}
            >
              <View style={styles.goalTop}>
                <View style={styles.goalLeft}>
                  <View style={styles.goalIcon}>
                    <Feather name={goal.icon} size={22} color={Colors.success} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.goalName}>{goal.name}</Text>
                    <Text style={styles.goalProgress}>
                      {goal.saved.toLocaleString('fr-FR')} / {goal.target.toLocaleString('fr-FR')} F
                    </Text>
                  </View>
                </View>
                <MiniProgress percentage={pct} />
              </View>
              <GoalBar pct={pct} />
            </TouchableOpacity>
          );
        })}

        

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.screen.bg },
  scroll: { paddingBottom: 100 },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: Theme.spacing.page,
    paddingTop: Theme.spacing.sm,
    paddingBottom: Theme.spacing.lg,
    gap: Theme.spacing.md,
  },
  titleBlock: { flex: 1 },
  pageTitle: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 26, color: Colors.gray[900], marginBottom: 6 },
  pageSubtitle: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[600], lineHeight: 20 },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    ...Theme.shadow.soft,
  },
  summaryHero: {
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Colors.success,
    borderRadius: Theme.radius.xl,
    padding: Theme.spacing.xl,
    marginBottom: Theme.spacing.xl,
    ...Theme.shadow.successHero,
  },
  summaryTag: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 0.8,
    marginBottom: Theme.spacing.md,
    textTransform: 'uppercase',
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Theme.spacing.lg },
  summaryLabel: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: 'rgba(255,255,255,0.85)', marginBottom: 4 },
  summaryValue: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 26, color: Colors.white },
  summaryTarget: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 20, color: 'rgba(255,255,255,0.95)' },
  globalBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
    marginBottom: Theme.spacing.sm,
  },
  globalBarFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: Colors.white,
  },
  summaryHint: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: 'rgba(255,255,255,0.8)' },
  sectionEyebrow: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 13,
    color: Colors.gray[500],
    paddingHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.md,
    letterSpacing: 0.2,
  },
  goalCard: {
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Theme.screen.surface,
    borderRadius: Theme.radius.lg,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    ...Theme.shadow.card,
  },
  goalTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Theme.spacing.md,
  },
  goalLeft: { flexDirection: 'row', alignItems: 'center', gap: Theme.spacing.md, flex: 1, paddingRight: 8 },
  goalIcon: {
    width: 48,
    height: 48,
    borderRadius: Theme.radius.sm,
    backgroundColor: withOpacity(Colors.success, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  goalName: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 17, color: Colors.gray[900], marginBottom: 4 },
  goalProgress: { fontFamily: Fonts.outfit.regular, fontSize: 13, color: Colors.gray[500] },
  miniPct: {
    position: 'absolute',
    fontFamily: Fonts.spaceGrotesk.bold,
    fontSize: 11,
    color: Colors.success,
  },
  goalBarTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.gray[100],
    overflow: 'hidden',
  },
  goalBarFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: Colors.success,
  },
  newProjectCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.md,
    marginHorizontal: Theme.spacing.page,
    marginTop: Theme.spacing.sm,
    padding: Theme.spacing.lg,
    backgroundColor: Theme.screen.surface,
    borderRadius: Theme.radius.lg,
    borderWidth: 1,
    borderColor: withOpacity(Colors.brand, 0.25),
    ...Theme.shadow.soft,
  },
  newProjectIcon: {
    width: 48,
    height: 48,
    borderRadius: Theme.radius.sm,
    backgroundColor: withOpacity(Colors.brand, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  newProjectTitle: { fontFamily: Fonts.outfit.medium, fontSize: 16, color: Colors.gray[900], marginBottom: 2 },
  newProjectSub: { fontFamily: Fonts.outfit.regular, fontSize: 13, color: Colors.gray[500] },
});
