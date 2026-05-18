import {
  View,
  Text,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { AnimatedPressable } from '@/shared/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';
import { getTontineById, parseTurn } from '@/modules/tontine/data/tontines';
import { needsDefineOrdre, ORDRE_LOCK_MESSAGE } from '@/modules/tontine/data/tontinePhase';
import { useTontinePhase } from '@/modules/tontine/hooks/useTontinePhase';
import type { Member } from '@/types';

const membersActive: Member[] = [
  { id: '1', name: 'Marie Koné', avatar: 'MK', status: 'paid', amount: 10000, turn: 1 },
  { id: '2', name: 'Jean Diabaté', avatar: 'JD', status: 'paid', amount: 10000, turn: 2 },
  { id: '3', name: 'Fatou Touré', avatar: 'FT', status: 'current', amount: 10000, turn: 3 },
  { id: '4', name: 'Amadou Bamba', avatar: 'AB', status: 'late', amount: 10000, turn: 4 },
];

const membersAwaitingOrdre: Member[] = [
  { id: '1', name: 'Kouassi Jean', avatar: 'KJ', status: 'paid', amount: 10000, turn: 1 },
  { id: '2', name: 'Awa Diallo', avatar: 'AD', status: 'paid', amount: 10000, turn: 2 },
  { id: '3', name: 'Amadou Bamba', avatar: 'AB', status: 'paid', amount: 10000, turn: 3 },
  { id: '4', name: 'Sophie Traoré', avatar: 'ST', status: 'paid', amount: 10000, turn: 4 },
  { id: '5', name: 'Moussa Keita', avatar: 'MK', status: 'paid', amount: 10000, turn: 5 },
  { id: '6', name: 'Fatou Touré', avatar: 'FT', status: 'paid', amount: 10000, turn: 6 },
  { id: '7', name: 'Jean Diabaté', avatar: 'JD', status: 'paid', amount: 10000, turn: 7 },
  { id: '8', name: 'Marie Koné', avatar: 'MK', status: 'paid', amount: 10000, turn: 8 },
];

const statusConfig = {
  paid: { label: 'Payé', color: Colors.success, bg: withOpacity(Colors.success, 0.1) },
  current: { label: 'En attente', color: Colors.brand, bg: withOpacity(Colors.brand, 0.1) },
  late: { label: 'Retard', color: Colors.danger, bg: withOpacity(Colors.danger, 0.06) },
};

export default function TontineDetailsScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const tontineId = typeof params.id === 'string' ? params.id : '1';
  const tontine = getTontineById(tontineId);
  const phaseState = useTontinePhase(tontineId);

  const tontineName = tontine?.name ?? 'Tontine';
  const cotisationAmount = tontine?.cotisationAmount ?? 10_000;
  const nombreMax = phaseState?.nombreMax ?? tontine?.nombreMax ?? 8;
  const membresActifs = phaseState?.membresActifs ?? tontine?.members ?? 0;

  const awaitingOrdre = phaseState ? needsDefineOrdre(phaseState) : false;
  const isActive = phaseState?.phase === 'active' && phaseState.ordrePublie;

  const members = awaitingOrdre ? membersAwaitingOrdre : membersActive;
  const paidCount = members.filter((m) => m.status === 'paid').length;
  const totalAmount = members.reduce((sum, m) => sum + (m.amount || 0), 0);

  const baseTurn = tontine?.turn ?? `1/${nombreMax}`;
  const turnStr = isActive
    ? baseTurn.startsWith('0/')
      ? `1/${nombreMax}`
      : baseTurn
    : `0/${nombreMax}`;
  const { current: currentTour, total: totalTours } = parseTurn(turnStr);
  const tourProgress = isActive ? Math.min(currentTour / totalTours, 1) : 0;

  const gaugeSize = 56;
  const gaugeStroke = 6;
  const gaugeRadius = (gaugeSize - gaugeStroke) / 2;
  const gaugeCircumference = 2 * Math.PI * gaugeRadius;
  const gaugeOffset = gaugeCircumference * (1 - tourProgress);

  const openDefineOrdre = () => {
    router.push({
      pathname: '/definir-ordre-ramassage',
      params: { tontineId, tontineNom: tontineName, memberCount: String(membresActifs) },
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <AnimatedPressable style={styles.backButton} onPress={() => router.back()}>
            <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
          </AnimatedPressable>
          <View style={styles.headerActions}>
            <AnimatedPressable
              onPress={() =>
                router.push({
                  pathname: '/admin',
                  params: { tontineId, tontineNom: tontineName },
                })
              }
            >
              <Text style={styles.adminLink}>Admin</Text>
            </AnimatedPressable>
            {!awaitingOrdre ? (
              <>
                <View style={styles.dot} />
                <AnimatedPressable
                  onPress={() =>
                    router.push({
                      pathname: '/new-invitation',
                      params: { tontineId, tontineNom: tontineName },
                    })
                  }
                >
                  <Text style={styles.inviteLink}>Inviter</Text>
                </AnimatedPressable>
              </>
            ) : null}
            <View style={styles.dot} />
            <AnimatedPressable style={styles.chatLink} onPress={() => router.push('/chat')}>
              <Feather name="message-circle" size={16} color={Colors.brand} />
              <Text style={styles.chatLinkText}>Discussion</Text>
            </AnimatedPressable>
          </View>
        </View>

        <View style={styles.titleRow}>
          {isActive ? (
            <View style={styles.gaugeWrap}>
              <Svg width={gaugeSize} height={gaugeSize}>
                <Circle
                  cx={gaugeSize / 2}
                  cy={gaugeSize / 2}
                  r={gaugeRadius}
                  stroke={withOpacity(Colors.success, 0.2)}
                  strokeWidth={gaugeStroke}
                  fill="none"
                />
                <Circle
                  cx={gaugeSize / 2}
                  cy={gaugeSize / 2}
                  r={gaugeRadius}
                  stroke={Colors.success}
                  strokeWidth={gaugeStroke}
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={`${gaugeCircumference} ${gaugeCircumference}`}
                  strokeDashoffset={gaugeOffset}
                  transform={`rotate(-90 ${gaugeSize / 2} ${gaugeSize / 2})`}
                />
              </Svg>
              <View style={styles.gaugeCenter}>
                <Text style={styles.gaugeValue}>{currentTour}</Text>
              </View>
            </View>
          ) : (
            <View style={styles.gaugePlaceholder}>
              <Feather name="clock" size={24} color={Colors.accent} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{tontineName}</Text>
            {awaitingOrdre ? (
              <Text style={styles.subtitle}>Groupe complet · {membresActifs}/{nombreMax} membres</Text>
            ) : (
              <Text style={styles.subtitle}>
                Tour {currentTour} sur {totalTours}
              </Text>
            )}
          </View>
        </View>

        {awaitingOrdre ? (
          <View style={styles.actionCard}>
            <View style={styles.actionIconWrap}>
              <Feather name="list" size={24} color={Colors.brand} />
            </View>
            <Text style={styles.actionTitle}>Définir l&apos;ordre de ramassage</Text>
            <Text style={styles.actionDesc}>
              Tous les membres ont rejoint. En tant qu&apos;administrateur, classez qui reçoit la
              cagnotte à chaque tour avant de lancer les cotisations.
            </Text>
            <AnimatedPressable style={styles.actionButton} onPress={openDefineOrdre}>
              <Feather name="edit-3" size={18} color={Colors.white} />
              <Text style={styles.actionButtonText}>Définir l&apos;ordre maintenant</Text>
            </AnimatedPressable>
            <Text style={styles.actionFootnote}>
              Une fois publié, l&apos;ordre sera verrouillé et ne pourra plus être modifié dans les
              paramètres.
            </Text>
          </View>
        ) : (
          <View style={styles.summaryCard}>
            <View style={styles.summaryRow}>
              <View>
                <Text style={styles.summaryLabel}>Cotisation</Text>
                <Text style={styles.summaryAmount}>
                  {cotisationAmount.toLocaleString('fr-FR')}{' '}
                  <Text style={{ fontSize: 16 }}>FCFA</Text>
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.summaryLabel}>Progression tour</Text>
                <Text style={styles.summaryProgress}>
                  {paidCount}/{members.length}
                </Text>
              </View>
            </View>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${(paidCount / members.length) * 100}%` }]} />
            </View>
          </View>
        )}

        <View style={styles.membersHeader}>
          <Text style={styles.membersTitle}>
            Membres ({membresActifs}/{nombreMax})
          </Text>
        </View>
        {members.map((m) => {
          const cfg = statusConfig[m.status];
          return (
            <View key={m.id} style={styles.memberItem}>
              <View style={styles.memberLeft}>
                <View style={styles.memberAvatar}>
                  <Text style={styles.memberAvatarText}>{m.avatar}</Text>
                </View>
                <View>
                  <Text style={styles.memberName}>{m.name}</Text>
                  <Text style={styles.memberTurn}>
                    {awaitingOrdre ? 'Ordre à attribuer' : `Tour ${m.turn}`}
                  </Text>
                </View>
              </View>
              {!awaitingOrdre ? (
                <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
                  <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
              ) : (
                <Text style={styles.positionHint}>#{m.turn}</Text>
              )}
            </View>
          );
        })}

        {isActive ? (
          <AnimatedPressable
            style={styles.payButton}
            onPress={() =>
              router.push({
                pathname: '/make-deposit',
                params: {
                  tontineId,
                  tontineName,
                  turn: String(currentTour),
                  amount: String(cotisationAmount),
                },
              })
            }
          >
            <Text style={styles.payButtonText}>Payer ma cotisation</Text>
          </AnimatedPressable>
        ) : null}

        {!awaitingOrdre && phaseState?.ordrePublie ? (
          <View style={styles.lockBanner}>
            <Feather name="lock" size={16} color={Colors.gray[600]} />
            <Text style={styles.lockText}>{ORDRE_LOCK_MESSAGE}</Text>
          </View>
        ) : null}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.screen.bg },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
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
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  adminLink: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.brand },
  inviteLink: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.success },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.gray[300] },
  chatLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chatLinkText: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.brand },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: Theme.spacing.page,
    marginBottom: 24,
  },
  gaugeWrap: { width: 56, height: 56, alignItems: 'center', justifyContent: 'center' },
  gaugePlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: withOpacity(Colors.accent, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  gaugeCenter: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  gaugeValue: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 16, color: Colors.gray[900] },
  title: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 24, color: Colors.gray[900] },
  subtitle: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[500] },
  actionCard: {
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Theme.screen.surface,
    borderRadius: Theme.radius.xl,
    padding: Theme.spacing.xl,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: withOpacity(Colors.brand, 0.25),
    alignItems: 'center',
    ...Theme.shadow.soft,
  },
  actionIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: withOpacity(Colors.brand, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Theme.spacing.md,
  },
  actionTitle: {
    fontFamily: Fonts.spaceGrotesk.bold,
    fontSize: 20,
    color: Colors.gray[900],
    textAlign: 'center',
    marginBottom: 8,
  },
  actionDesc: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    color: Colors.gray[600],
    textAlign: 'center',
    lineHeight: 21,
    marginBottom: Theme.spacing.lg,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.brand,
    paddingVertical: 14,
    paddingHorizontal: Theme.spacing.xl,
    borderRadius: Theme.radius.md,
    width: '100%',
    justifyContent: 'center',
  },
  actionButtonText: { fontFamily: Fonts.outfit.medium, fontSize: 16, color: Colors.white },
  actionFootnote: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 12,
    color: Colors.gray[500],
    textAlign: 'center',
    marginTop: Theme.spacing.md,
    lineHeight: 18,
  },
  summaryCard: {
    marginHorizontal: Theme.spacing.page,
    backgroundColor: withOpacity(Colors.success, 0.1),
    borderRadius: 24,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: withOpacity(Colors.success, 0.2),
  },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  summaryLabel: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[600], marginBottom: 4 },
  summaryAmount: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 24, color: Colors.gray[900] },
  summaryProgress: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 20, color: Colors.success },
  progressBar: { height: 8, backgroundColor: Colors.gray[200], borderRadius: 4 },
  progressFill: { height: 8, backgroundColor: Colors.success, borderRadius: 4 },
  membersHeader: { paddingHorizontal: Theme.spacing.page, marginBottom: 12 },
  membersTitle: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 20, color: Colors.gray[900] },
  memberItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Colors.gray[50],
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
  },
  memberLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  memberAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarText: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 14, color: Colors.white },
  memberName: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.gray[900] },
  memberTurn: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500] },
  positionHint: { fontFamily: Fonts.outfit.medium, fontSize: 13, color: Colors.gray[400] },
  badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontFamily: Fonts.outfit.medium, fontSize: 12 },
  payButton: {
    marginHorizontal: Theme.spacing.page,
    marginTop: 16,
    backgroundColor: Colors.brand,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  payButtonText: { fontFamily: Fonts.outfit.medium, fontSize: 16, color: Colors.white },
  lockBanner: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: Theme.spacing.page,
    marginTop: Theme.spacing.lg,
    padding: Theme.spacing.md,
    backgroundColor: Colors.gray[50],
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    alignItems: 'flex-start',
  },
  lockText: {
    flex: 1,
    fontFamily: Fonts.outfit.regular,
    fontSize: 12,
    color: Colors.gray[600],
    lineHeight: 18,
  },
});
