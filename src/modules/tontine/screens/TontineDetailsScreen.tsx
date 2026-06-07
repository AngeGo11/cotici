import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { AnimatedPressable } from '@/shared/ui';
import { useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Svg, { Circle } from 'react-native-svg';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';
import { changerTour, demarrerTontine, parseTurn } from '@/shared/api';
import { useAuth } from '@/shared/auth';
import { ORDRE_LOCK_MESSAGE } from '@/modules/tontine/data/tontinePhase';
import { useTontineDetail } from '@/modules/tontine/hooks/useTontineDetail';
import type { TontineMember } from '@/shared/api';

function memberBadgeConfig(
  status: TontineMember['status'],
  turn: number,
): { label: string; color: string; bg: string } | undefined {
  switch (status) {
    case 'awaiting_payment':
      return {
        label: 'À votre tour',
        color: Colors.accent,
        bg: withOpacity(Colors.accent, 0.12),
      };
    case 'waiting_turn':
      return {
        label: 'Pas encore votre tour',
        color: Colors.gray[600],
        bg: withOpacity(Colors.gray[500], 0.1),
      };
    case 'paid':
      return {
        label: 'Payé',
        color: Colors.success,
        bg: withOpacity(Colors.success, 0.1),
      };
    case 'beneficiary':
      return {
        label: `Bénéficiaire du tour`,
        color: Colors.brand,
        bg: withOpacity(Colors.brand, 0.1),
      };
    default:
      return undefined;
  }
}

export default function TontineDetailsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ id?: string }>();
  const tontineId = typeof params.id === 'string' ? params.id : undefined;
  const { detail, loading, error, reload } = useTontineDetail(tontineId);
  const [startingTour, setStartingTour] = useState(false);
  const [closingTour, setClosingTour] = useState(false);

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
          <Text style={styles.errorText}>{error ?? 'Tontine introuvable.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const tontineName = detail.nom;
  const cotisationAmount = detail.cotisation_amount;
  const nombreMax = detail.nombre_max;
  const membresActifs = detail.membres_actifs;
  const potParTour =
    parseInt(detail.pot_attendu ?? '0', 10) ||
    detail.amount ||
    (cotisationAmount > 0 && nombreMax > 0 ? cotisationAmount * nombreMax : 0);

  const isHost = user?.id != null && detail.hote_id === user.id;

  const isCompleted = detail.phase === 'completed' || detail.cycle_termine;
  const isRecruiting = detail.phase === 'recruiting';
  const isAwaitingOrdre = detail.phase === 'awaiting_ordre';
  const awaitingOrdre = isAwaitingOrdre && detail.is_admin;
  const hasTour = Boolean(detail.tour_courant) && !isCompleted;
  const cycleNotStarted = !isCompleted && !hasTour;
  const placesRestantes = Math.max(0, nombreMax - membresActifs);
  const showMemberBadges = detail.phase === 'active' && hasTour;
  const isActive = detail.phase === 'active' && (hasTour || detail.ordre_publie);

  const members: TontineMember[] = detail.membres;
  const paidCount = showMemberBadges
    ? members.filter((m) => m.status === 'paid' || m.status === 'beneficiary').length
    : 0;

  const turnStr = detail.turn;
  const { current: currentTour, total: totalTours } = parseTurn(turnStr);
  const tourProgress = isCompleted
    ? 1
    : hasTour
      ? Math.min(currentTour / Math.max(totalTours, 1), 1)
      : 0;

  const myMembership = members.find((m) => m.user_id === user?.id);
  const canPay = Boolean(
    showMemberBadges && myMembership && myMembership.status === 'awaiting_payment',
  );
  const canStartTour =
    isHost &&
    detail.ordre_publie &&
    !hasTour &&
    detail.phase === 'active' &&
    membresActifs >= nombreMax;
  const canInvite = detail.is_admin && membresActifs < nombreMax && !isCompleted;
  const allMembersPaid =
    showMemberBadges && members.length > 0 && paidCount === members.length;
  const canCloseTour = isHost && hasTour && allMembersPaid;
  const beneficiaryMember = detail.tour_courant
    ? members.find((m) => m.user_id === detail.tour_courant?.beneficiaire_id)
    : undefined;

  const gaugeSize = 56;
  const gaugeStroke = 6;
  const gaugeRadius = (gaugeSize - gaugeStroke) / 2;
  const gaugeCircumference = 2 * Math.PI * gaugeRadius;
  const gaugeOffset = gaugeCircumference * (1 - tourProgress);

  const handleCloseTour = () => {
    const benefName = beneficiaryMember?.name ?? 'le bénéficiaire';
    const isLastTour = currentTour >= totalTours;
    Alert.alert(
      isLastTour ? 'Clôturer la tontine' : 'Clôturer le tour',
      isLastTour
        ? `Verser la cagnotte à ${benefName} et terminer la tontine ?`
        : `Verser la cagnotte à ${benefName} et passer au tour ${currentTour + 1} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: isLastTour ? 'Terminer' : 'Verser et continuer',
          onPress: () => {
            void (async () => {
              setClosingTour(true);
              const result = await changerTour(detail.id);
              setClosingTour(false);
              if (!result.ok) {
                Alert.alert('Erreur', result.detail);
                return;
              }
              if (result.data.tontine_terminee) {
                Alert.alert('Tontine terminée', result.data.detail);
              }
              await reload();
            })();
          },
        },
      ],
    );
  };

  const handleStartTour = () => {
    Alert.alert(
      'Démarrer le cycle',
      'Lancer le tour 1 et ouvrir les cotisations pour tous les membres ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Démarrer',
          onPress: () => {
            void (async () => {
              setStartingTour(true);
              const result = await demarrerTontine(detail.id);
              setStartingTour(false);
              if (!result.ok) {
                Alert.alert('Erreur', result.detail);
                return;
              }
              await reload();
            })();
          },
        },
      ],
    );
  };

  const openDefineOrdre = () => {
    router.push({
      pathname: '/definir-ordre-ramassage',
      params: {
        tontineId: String(detail.id),
        tontineNom: tontineName,
        memberCount: String(membresActifs),
      },
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
            {isHost ? (
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
            ) : null}
            {canInvite ? (
              <>
                {isHost ? <View style={styles.dot} /> : null}
                <AnimatedPressable
                  onPress={() =>
                    router.push({
                      pathname: '/new-invitation',
                      params: { tontineId: String(detail.id), tontineNom: tontineName },
                    })
                  }
                >
                  <Text style={styles.inviteLink}>Inviter</Text>
                </AnimatedPressable>
              </>
            ) : null}
            {isHost || canInvite ? <View style={styles.dot} /> : null}
            <AnimatedPressable
              style={styles.chatLink}
              onPress={() =>
                router.push({
                  pathname: '/chat',
                  params: {
                    id: String(detail.id),
                    name: tontineName,
                    members: String(membresActifs),
                  },
                })
              }
            >
              <Feather name="message-circle" size={16} color={Colors.brand} />
              <Text style={styles.chatLinkText}>Discussion</Text>
            </AnimatedPressable>
          </View>
        </View>

        <View style={styles.titleRow}>
          {isCompleted ? (
            <View style={[styles.gaugePlaceholder, { backgroundColor: withOpacity(Colors.success, 0.12) }]}>
              <Feather name="check-circle" size={28} color={Colors.success} />
            </View>
          ) : hasTour ? (
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
            {isCompleted ? (
              <Text style={styles.subtitle}>
                Cycle terminé · {totalTours}/{totalTours} tours
              </Text>
            ) : isRecruiting ? (
              <Text style={styles.subtitle}>En attente de tous les membres</Text>
            ) : isAwaitingOrdre ? (
              <Text style={styles.subtitle}>
                Groupe complet · {membresActifs}/{nombreMax} membres
              </Text>
            ) : cycleNotStarted ? (
              <Text style={styles.subtitle}>Prêt à démarrer</Text>
            ) : (
              <Text style={styles.subtitle}>
                Tour {currentTour} sur {totalTours}
              </Text>
            )}
          </View>
        </View>

        {isCompleted ? (
          <View style={styles.successBanner}>
            <Feather name="check-circle" size={22} color={Colors.success} />
            <View style={styles.successBannerTexts}>
              <Text style={styles.successBannerTitle}>Cycle terminé</Text>
              <Text style={styles.successBannerSub}>
                Les {totalTours} tours sont achevés. Chaque membre a reçu son pot de{' '}
                {potParTour > 0 ? `${potParTour.toLocaleString('fr-FR')} FCFA` : 'cagnotte'}.
              </Text>
            </View>
          </View>
        ) : null}

        {!isCompleted && potParTour > 0 ? (
          <View style={styles.objectifCard}>
            <View style={styles.objectifHeader}>
              <Feather name="layers" size={18} color={Colors.brand} />
              <Text style={styles.objectifLabel}>Pot du tour</Text>
            </View>
            <Text style={styles.objectifAmount}>
              {potParTour.toLocaleString('fr-FR')}{' '}
              <Text style={styles.objectifUnit}>FCFA</Text>
            </Text>
            {cotisationAmount > 0 ? (
              <Text style={styles.objectifHint}>
                Mise : {cotisationAmount.toLocaleString('fr-FR')} FCFA / membre · {nombreMax} tours
                (1 cycle)
              </Text>
            ) : null}
          </View>
        ) : null}

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
        ) : canStartTour ? (
          <View style={styles.actionCard}>
            <View style={styles.actionIconWrap}>
              <Feather name="play-circle" size={24} color={Colors.success} />
            </View>
            <Text style={styles.actionTitle}>Prêt à démarrer</Text>
            <Text style={styles.actionDesc}>
              Le groupe est complet et l&apos;ordre de ramassage est défini. Lancez le premier tour
              pour collecter les cotisations.
            </Text>
            <AnimatedPressable
              style={[styles.actionButton, { backgroundColor: Colors.success }]}
              onPress={handleStartTour}
              disabled={startingTour}
            >
              {startingTour ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Feather name="play" size={18} color={Colors.white} />
              )}
              <Text style={styles.actionButtonText}>Démarrer le tour 1</Text>
            </AnimatedPressable>
          </View>
        ) : showMemberBadges ? (
          <>
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <View>
                  <Text style={styles.summaryLabel}>Cotisation</Text>
                  <Text style={styles.summaryAmount}>
                    {cotisationAmount.toLocaleString('fr-FR')}{' '}
                    <Text style={{ fontSize: 16 }}>FCFA/participant</Text>
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
                <View
                  style={[styles.progressFill, { width: `${(paidCount / members.length) * 100}%` }]}
                />
              </View>
            </View>
            {canCloseTour ? (
              <View style={styles.actionCard}>
                <View style={[styles.actionIconWrap, { backgroundColor: withOpacity(Colors.brand, 0.12) }]}>
                  <Feather name="gift" size={24} color={Colors.brand} />
                </View>
                <Text style={styles.actionTitle}>Tour complet</Text>
                <Text style={styles.actionDesc}>
                  Tous les membres ont cotisé. Versez la cagnotte à{' '}
                  {beneficiaryMember?.name ?? 'le bénéficiaire'}
                  {currentTour >= totalTours
                    ? ' pour clôturer la tontine.'
                    : ` puis lancez le tour ${currentTour + 1}.`}
                </Text>
                <AnimatedPressable
                  style={styles.actionButton}
                  onPress={handleCloseTour}
                  disabled={closingTour}
                >
                  {closingTour ? (
                    <ActivityIndicator color={Colors.white} />
                  ) : (
                    <Feather name="check-circle" size={18} color={Colors.white} />
                  )}
                  <Text style={styles.actionButtonText}>
                    {currentTour >= totalTours
                      ? 'Verser et terminer la tontine'
                      : 'Verser et passer au tour suivant'}
                  </Text>
                </AnimatedPressable>
              </View>
            ) : isHost && hasTour && !allMembersPaid ? (
              <Text style={styles.hostHint}>
                En tant qu&apos;hôte, vous pourrez verser la cagnotte une fois que tous les membres
                auront payé ({paidCount}/{members.length}).
              </Text>
            ) : null}
          </>
        ) : null}

        <View style={styles.membersHeader}>
          <Text style={styles.membersTitle}>
            Membres ({membresActifs}/{nombreMax})
          </Text>
        </View>
        {members.map((m) => {
          const cfg = memberBadgeConfig(m.status, m.turn);
          const memberSubline = isCompleted
            ? `Cycle terminé · rang ${m.turn}`
            : isRecruiting
              ? placesRestantes === 1
                ? 'Membre confirmé · 1 place restante'
                : `Membre confirmé · ${placesRestantes} places restantes`
              : isAwaitingOrdre
                ? `Rang ${m.turn} · ordre de ramassage`
                : showMemberBadges
                  ? `Tour de ramassage ${m.turn}`
                  : `Rang ${m.turn}`;
          return (
            <View key={m.id} style={styles.memberItem}>
              <View style={styles.memberLeft}>
                <View style={styles.memberAvatar}>
                  <Text style={styles.memberAvatarText}>{m.avatar}</Text>
                </View>
                <View>
                  <Text style={styles.memberName}>{m.name}</Text>
                  <Text style={styles.memberTurn}>{memberSubline}</Text>
                </View>
              </View>
              {showMemberBadges && cfg ? (
                <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
                  <Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
              ) : m.turn > 0 ? (
                <Text style={styles.positionHint}>#{m.turn}</Text>
              ) : null}
            </View>
          );
        })}

        {canPay ? (
          <AnimatedPressable
            style={styles.payButton}
            onPress={() =>
              router.push({
                pathname: '/make-deposit',
                params: {
                  tontineId: String(detail.id),
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

        {!isCompleted && !awaitingOrdre && detail.ordre_publie ? (
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
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Theme.spacing.page },
  errorText: { fontFamily: Fonts.outfit.regular, fontSize: 15, color: Colors.gray[600], textAlign: 'center' },
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
  objectifCard: {
    marginHorizontal: Theme.spacing.page,
    marginBottom: 20,
    padding: 16,
    borderRadius: Theme.radius.md,
    backgroundColor: withOpacity(Colors.brand, 0.06),
    borderWidth: 1,
    borderColor: withOpacity(Colors.brand, 0.15),
  },
  objectifHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  objectifLabel: { fontFamily: Fonts.outfit.medium, fontSize: 13, color: Colors.gray[600] },
  objectifAmount: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 26, color: Colors.gray[900] },
  objectifUnit: { fontFamily: Fonts.outfit.regular, fontSize: 16, color: Colors.gray[600] },
  objectifHint: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 13,
    color: Colors.gray[500],
    marginTop: 8,
  },
  successBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginHorizontal: Theme.spacing.page,
    marginBottom: 20,
    padding: Theme.spacing.lg,
    borderRadius: Theme.radius.lg,
    backgroundColor: withOpacity(Colors.success, 0.1),
    borderWidth: 1,
    borderColor: withOpacity(Colors.success, 0.25),
  },
  successBannerTexts: { flex: 1 },
  successBannerTitle: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 15,
    color: Colors.gray[900],
    marginBottom: 4,
  },
  successBannerSub: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 13,
    color: Colors.gray[600],
    lineHeight: 18,
  },
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
  hostHint: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 13,
    color: Colors.gray[600],
    marginHorizontal: Theme.spacing.page,
    marginBottom: 24,
    lineHeight: 20,
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
