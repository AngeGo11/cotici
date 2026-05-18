import { 
  View,
  Text,
  ScrollView,
  StyleSheet,
 } from 'react-native';
import { AnimatedPressable } from '@/shared/ui';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';
import {
  getTontineListBadge,
  getTontinesForList,
  parseTurn,
} from '@/modules/tontine/data/tontines';
import { getTontinePhaseState } from '@/modules/tontine/data/tontinePhase';
import { useTontinePhase } from '@/modules/tontine/hooks/useTontinePhase';

const statusLabel = {
  active: { text: 'Actif', color: Colors.success, bg: withOpacity(Colors.success, 0.12) },
  paused: { text: 'En pause', color: Colors.gray[500], bg: withOpacity(Colors.gray[500], 0.12) },
};

export default function TontineListScreen() {
  const router = useRouter();
  useTontinePhase('2');
  const tontines = getTontinesForList();

  const totalCotisations = tontines.reduce((s, t) => s + t.amount, 0);
  const avgCyclePct =
    tontines.length > 0
      ? Math.round(
          tontines.reduce((s, t) => s + parseTurn(t.turn).pct, 0) / tontines.length,
        )
      : 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.topRow}>
          <View style={styles.titleBlock}>
            <Text style={styles.pageTitle}>Mes tontines</Text>
            <Text style={styles.pageSubtitle}>
              Cotisez en groupe et suivez l&apos;avancement de chaque cycle
            </Text>
          </View>
          <AnimatedPressable
            style={styles.addButton}
            onPress={() => router.push('/create-savings')}
            accessibilityLabel="Créer une tontine ou un projet" >
            <Feather name="plus" size={22} color={Colors.white} />
          </AnimatedPressable>
        </View>

        <View style={styles.summaryHero}>
          <Text style={styles.summaryTag}>Vue d&apos;ensemble</Text>
          <View style={styles.summaryRow}>
            <View>
              <Text style={styles.summaryLabel}>Tontines actives</Text>
              <Text style={styles.summaryValue}>{tontines.length}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.summaryLabel}>Cotisations / mois</Text>
              <Text style={styles.summaryTarget}>{totalCotisations.toLocaleString('fr-FR')} F</Text>
            </View>
          </View>
          <View style={styles.globalBarTrack}>
            <View style={[styles.globalBarFill, { width: `${avgCyclePct}%` }]} />
          </View>
          <Text style={styles.summaryHint}>
            En moyenne, les cycles sont avancés à {avgCyclePct}%
          </Text>
        </View>

        <Text style={styles.sectionEyebrow}>Vos groupes</Text>

        {tontines.map((tontine) => {
          const live = getTontinePhaseState(tontine.id);
          const phase = live?.phase ?? tontine.phase;
          const flowBadge = getTontineListBadge(tontine);
          const status = tontine.status === 'paused' ? statusLabel.paused : flowBadge ?? statusLabel.active;
          let displayTurn = tontine.turn;
          if (phase === 'active' && live?.ordrePublie && displayTurn.startsWith('0/')) {
            const { total } = parseTurn(displayTurn);
            displayTurn = `1/${total}`;
          }
          const { current, total, pct } = parseTurn(displayTurn);
          const membresLabel = live
            ? `${live.membresActifs}/${live.nombreMax} membres`
            : `${tontine.members} membres`;

          return (
            <AnimatedPressable
              key={tontine.id}
              style={styles.tontineCard}
              onPress={() =>
                router.push(
                  tontine.isSolidarity
                    ? '/solidarity'
                    : { pathname: '/tontine-details', params: { id: tontine.id } },
                )
              }
            >
              <View style={styles.cardTop}>
                <View style={styles.cardIcon}>
                  <Feather name="users" size={22} color={Colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tontineName}>{tontine.name}</Text>
                  <View style={styles.metaRow}>
                    <Feather name="user" size={13} color={Colors.gray[500]} />
                    <Text style={styles.tontineMembers}>{membresLabel}</Text>
                  </View>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: status.bg }]}>
                  <Text style={[styles.statusText, { color: status.color }]}>{status.text}</Text>
                </View>
              </View>

              {phase === 'awaiting_ordre' ? (
                <View style={styles.awaitingBlock}>
                  <Feather name="list" size={16} color={Colors.accent} />
                  <Text style={styles.awaitingText}>
                    Groupe complet — définissez l&apos;ordre de ramassage pour démarrer
                  </Text>
                </View>
              ) : (
                <View style={styles.turnBlock}>
                  <View style={styles.turnHeader}>
                    <Text style={styles.turnLabel}>Cycle en cours</Text>
                    <Text style={styles.turnFraction}>
                      Tour {current}/{total}
                    </Text>
                  </View>
                  <View style={styles.turnTrack}>
                    <View style={[styles.turnFill, { width: `${pct}%` }]} />
                  </View>
                </View>
              )}

              <View style={styles.cardBottom}>
                <View>
                  <Text style={styles.detailLabel}>Cotisation</Text>
                  <Text style={styles.detailValue}>{tontine.amount.toLocaleString('fr-FR')} F</Text>
                </View>
                <View style={styles.chevronWrap}>
                  <Feather name="chevron-right" size={22} color={Colors.gray[400]} />
                </View>
              </View>
            </AnimatedPressable>
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
  pageTitle: {
    fontFamily: Fonts.spaceGrotesk.bold,
    fontSize: 26,
    color: Colors.gray[900],
    marginBottom: 6,
  },
  pageSubtitle: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    color: Colors.gray[600],
    lineHeight: 20,
  },
  addButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
    ...Theme.shadow.soft,
  },
  summaryHero: {
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Colors.brand,
    borderRadius: Theme.radius.xl,
    padding: Theme.spacing.xl,
    marginBottom: Theme.spacing.xl,
    ...Theme.shadow.brandHero,
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
  summaryLabel: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 4,
  },
  summaryValue: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 28, color: Colors.white },
  summaryTarget: {
    fontFamily: Fonts.spaceGrotesk.bold,
    fontSize: 22,
    color: 'rgba(255,255,255,0.95)',
  },
  globalBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.22)',
    overflow: 'hidden',
    marginBottom: Theme.spacing.sm,
  },
  globalBarFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: Colors.white,
  },
  summaryHint: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 12,
    color: 'rgba(255,255,255,0.82)',
  },
  sectionEyebrow: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 13,
    color: Colors.gray[500],
    paddingHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.md,
    letterSpacing: 0.2,
  },
  tontineCard: {
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Theme.screen.surface,
    borderRadius: Theme.radius.lg,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    ...Theme.shadow.card,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: Theme.spacing.md, marginBottom: Theme.spacing.lg },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: Theme.radius.sm,
    backgroundColor: withOpacity(Colors.brand, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  tontineName: {
    fontFamily: Fonts.spaceGrotesk.bold,
    fontSize: 17,
    color: Colors.gray[900],
    marginBottom: 6,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tontineMembers: { fontFamily: Fonts.outfit.regular, fontSize: 13, color: Colors.gray[500] },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: Theme.radius.pill },
  statusText: { fontFamily: Fonts.outfit.medium, fontSize: 11 },
  awaitingBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: Theme.spacing.lg,
    padding: Theme.spacing.md,
    backgroundColor: withOpacity(Colors.accent, 0.08),
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: withOpacity(Colors.accent, 0.2),
  },
  awaitingText: {
    flex: 1,
    fontFamily: Fonts.outfit.regular,
    fontSize: 13,
    color: Colors.gray[700],
    lineHeight: 18,
  },
  turnBlock: { marginBottom: Theme.spacing.lg },
  turnHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  turnLabel: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500] },
  turnFraction: { fontFamily: Fonts.outfit.medium, fontSize: 12, color: Colors.gray[700] },
  turnTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.gray[100],
    overflow: 'hidden',
  },
  turnFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: Colors.brand,
  },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500], marginBottom: 2 },
  detailValue: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 18, color: Colors.gray[900] },
  chevronWrap: { justifyContent: 'center' },
  createCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.md,
    marginHorizontal: Theme.spacing.page,
    marginTop: Theme.spacing.sm,
    padding: Theme.spacing.lg,
    backgroundColor: Theme.screen.surface,
    borderRadius: Theme.radius.lg,
    borderWidth: 1,
    borderColor: withOpacity(Colors.brand, 0.22),
    ...Theme.shadow.soft,
  },
  createIcon: {
    width: 48,
    height: 48,
    borderRadius: Theme.radius.sm,
    backgroundColor: withOpacity(Colors.brand, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  createTitle: { fontFamily: Fonts.outfit.medium, fontSize: 16, color: Colors.gray[900], marginBottom: 2 },
  createSubtitle: { fontFamily: Fonts.outfit.regular, fontSize: 13, color: Colors.gray[500] },
});
