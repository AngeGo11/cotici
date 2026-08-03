import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { AnimatedPressable, ConfirmSheet, ProgressGauge, StatusBadge } from '@/shared/ui';
import type { StatusTone } from '@/shared/ui';
import { useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';
import { archiveGroupeTontine, changerTour, deleteGroupeTontine, demarrerTontine, parseTurn } from '@/shared/api';
import { useAuth } from '@/shared/auth';
import { ORDRE_LOCK_MESSAGE, ORDRE_RANDOM_EXPLANATION } from '@/modules/tontine/utils/ordreRamassage';
import { useTontineDetail } from '@/modules/tontine/hooks/useTontineDetail';
import type { TontineMember } from '@/shared/api';

function memberBadgeConfig(
  status: TontineMember['status'],
): { label: string; tone: StatusTone } | undefined {
  switch (status) {
    case 'awaiting_payment':
      return { label: 'À votre tour', tone: 'warning' };
    case 'waiting_turn':
      return { label: 'Pas encore votre tour', tone: 'neutral' };
    case 'paid':
      return { label: 'Payé', tone: 'success' };
    case 'beneficiary':
      return { label: 'Bénéficiaire du tour', tone: 'brand' };
    default:
      return undefined;
  }
}

export default function TontineDetailsScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ id?: string; focus?: string }>();
  const tontineId = typeof params.id === 'string' ? params.id : undefined;
  const focusPayment = params.focus === 'payment';
  const { detail, loading, error, reload } = useTontineDetail(tontineId);
  const scrollRef = useRef<ScrollView>(null);
  const payButtonY = useRef<number | null>(null);
  const hasScrolledToPay = useRef(false);
  const [startingTour, setStartingTour] = useState(false);
  const [closingTour, setClosingTour] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [startSheetOpen, setStartSheetOpen] = useState(false);
  const [closeSheetOpen, setCloseSheetOpen] = useState(false);

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
  const isRandomOrdre = detail.ordre_mode === 'random';
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
  const canManageLifecycle = isHost && (isCompleted || cycleNotStarted);
  const beneficiaryMember = detail.tour_courant
    ? members.find((m) => m.user_id === detail.tour_courant?.beneficiaire_id)
    : undefined;

  const benefName = beneficiaryMember?.name ?? 'le bénéficiaire';
  const isLastTour = currentTour >= totalTours;

  const handleCloseTour = () => setCloseSheetOpen(true);
  const handleStartTour = () => setStartSheetOpen(true);

  const confirmCloseTour = () => {
    void (async () => {
      setClosingTour(true);
      const result = await changerTour(detail.id);
      setClosingTour(false);
      setCloseSheetOpen(false);
      if (!result.ok) {
        Alert.alert('Erreur', result.detail);
        return;
      }
      if (result.data.tontine_terminee) {
        Alert.alert('Tontine terminée', result.data.detail);
      }
      await reload();
    })();
  };

  const confirmStartTour = () => {
    void (async () => {
      setStartingTour(true);
      const result = await demarrerTontine(detail.id);
      setStartingTour(false);
      setStartSheetOpen(false);
      if (!result.ok) {
        Alert.alert('Erreur', result.detail);
        return;
      }
      await reload();
    })();
  };

  const handleArchivePress = () => {
    Alert.alert(
      'Archiver cette tontine',
      'Elle sera retirée de votre liste active. Vous pourrez toujours consulter son historique.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Archiver',
          onPress: () => {
            void (async () => {
              setIsArchiving(true);
              const result = await archiveGroupeTontine(detail.id);
              if (!result.ok) {
                Alert.alert('Erreur', result.detail);
                setIsArchiving(false);
                return;
              }
              setIsArchiving(false);
              router.replace('/(tabs)/tontine');
            })();
          },
        },
      ],
    );
  };

  const handleDeletePress = () => {
    Alert.alert(
      'Supprimer cette tontine',
      'Cette action est définitive. La tontine ne sera plus visible.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              setIsArchiving(true);
              const result = await deleteGroupeTontine(detail.id);
              if (!result.ok) {
                Alert.alert('Erreur', result.detail);
                setIsArchiving(false);
                return;
              }
              setIsArchiving(false);
              router.replace('/(tabs)/tontine');
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
      <ScrollView ref={scrollRef} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <AnimatedPressable style={styles.backButton} onPress={() => router.back()}>
            <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
          </AnimatedPressable>
          <View style={styles.headerActions}>
            {detail.is_admin ? (
              <AnimatedPressable
                style={styles.paramsLink}
                onPress={() =>
                  router.push({
                    pathname: '/parametres-groupe',
                    params: { id: String(detail.id) },
                  })
                }
                accessibilityRole="button"
                accessibilityLabel="Paramètres du groupe"
              >
                <Feather name="settings" size={16} color={Colors.brand} />
                <Text style={styles.adminLink}>Paramètres</Text>
              </AnimatedPressable>
            ) : null}
            {canInvite ? (
              <>
                {detail.is_admin ? <View style={styles.dot} /> : null}
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
            {detail.is_admin || canInvite ? <View style={styles.dot} /> : null}
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
            <ProgressGauge
              progress={tourProgress}
              size={56}
              color={Colors.success}
              label={String(currentTour)}
              accessibilityLabel={`Tour ${currentTour} sur ${totalTours}`}
            />
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

        {isRandomOrdre && !isCompleted ? (
          <View style={styles.randomInfoCard}>
            <Feather name="shuffle" size={18} color={Colors.info} />
            <Text style={styles.randomInfoText}>{ORDRE_RANDOM_EXPLANATION}</Text>
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
            <AnimatedPressable
              style={styles.actionButton}
              onPress={openDefineOrdre}
              accessibilityRole="button"
              accessibilityLabel="Définir l'ordre de ramassage maintenant"
            >
              <Feather name="edit-3" size={18} color={Colors.white} />
              <Text style={styles.actionButtonText}>Définir l&apos;ordre maintenant</Text>
            </AnimatedPressable>
            <Text style={styles.actionFootnote}>
              Une fois publié, l&apos;ordre sera verrouillé et ne pourra plus être modifié dans les
              paramètres.
            </Text>
          </View>
        ) : isAwaitingOrdre ? (
          <View style={styles.actionCard}>
            <View style={[styles.actionIconWrap, { backgroundColor: withOpacity(Colors.accent, 0.12) }]}>
              <Feather name="clock" size={24} color={Colors.accent} />
            </View>
            <Text style={styles.actionTitle}>En attente de l&apos;ordre de ramassage</Text>
            <Text style={styles.actionDesc}>
              Le groupe est complet. L&apos;organisateur doit encore définir et publier l&apos;ordre de
              ramassage avant que les cotisations ne démarrent.
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
              accessibilityRole="button"
              accessibilityLabel="Démarrer le tour 1"
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
                  accessibilityRole="button"
                  accessibilityLabel={
                    currentTour >= totalTours
                      ? 'Verser et terminer la tontine'
                      : 'Verser et passer au tour suivant'
                  }
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
          const cfg = memberBadgeConfig(m.status);
          const memberSubline = isRecruiting
            ? placesRestantes === 1
              ? 'Membre confirmé · 1 place restante'
              : `Membre confirmé · ${placesRestantes} places restantes`
            : isRandomOrdre
              ? isCompleted
                ? 'Cycle terminé · ordre tiré au sort'
                : showMemberBadges
                  ? 'Bénéficiaire tiré au sort à chaque tour'
                  : 'Ordre tiré au sort à chaque tour'
              : isCompleted
                ? `Cycle terminé · rang ${m.turn}`
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
                <StatusBadge label={cfg.label} tone={cfg.tone} />
              ) : !isRandomOrdre && m.turn > 0 ? (
                <Text style={styles.positionHint}>#{m.turn}</Text>
              ) : null}
            </View>
          );
        })}

        {canPay ? (
          <AnimatedPressable
            style={styles.payButton}
            onLayout={(event) => {
              const y = event.nativeEvent.layout.y;
              payButtonY.current = y;
              // Deep-link « cotisation » depuis une notification : amener le
              // CTA de paiement à l'écran sans que l'utilisateur ait à
              // scroller manuellement.
              if (focusPayment && !hasScrolledToPay.current) {
                hasScrolledToPay.current = true;
                scrollRef.current?.scrollTo({ y: Math.max(y - 24, 0), animated: true });
              }
            }}
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

        {!isCompleted && !awaitingOrdre && !isRandomOrdre && detail.ordre_publie ? (
          <View style={styles.lockBanner}>
            <Feather name="lock" size={16} color={Colors.gray[600]} />
            <Text style={styles.lockText}>{ORDRE_LOCK_MESSAGE}</Text>
          </View>
        ) : null}

        {isCompleted && isHost ? (
          <View style={styles.completedBanner}>
            <Feather name="check-circle" size={22} color={Colors.success} />
            <View style={styles.completedBannerTexts}>
              <Text style={styles.completedBannerTitle}>Tontine terminée</Text>
              <Text style={styles.completedBannerSub}>
                Le cycle est clos. Archivez ou supprimez cette tontine pour la retirer de votre liste active.
              </Text>
            </View>
          </View>
        ) : null}

        {canManageLifecycle ? (
          <View style={styles.lifecycleSection}>
            {!isCompleted ? (
              <Text style={styles.lifecycleHint}>
                {isRecruiting || isAwaitingOrdre
                  ? 'Aucun tour n’a encore démarré. Vous pouvez archiver ou supprimer cette tontine.'
                  : 'Le cycle n’a pas encore commencé. Vous pouvez archiver ou supprimer cette tontine.'}
              </Text>
            ) : null}
            <AnimatedPressable
              style={[styles.archiveButton, isArchiving && styles.buttonDisabled]}
              onPress={handleArchivePress}
              disabled={isArchiving}
              accessibilityRole="button"
              accessibilityLabel="Archiver la tontine"
            >
              <Feather name="archive" size={18} color={Colors.gray[700]} />
              <Text style={styles.archiveButtonText}>Archiver la tontine</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={[styles.deleteButton, isArchiving && styles.buttonDisabled]}
              onPress={handleDeletePress}
              disabled={isArchiving}
              accessibilityRole="button"
              accessibilityLabel="Supprimer la tontine, action définitive"
            >
              <Feather name="trash-2" size={18} color={Colors.danger} />
              <Text style={styles.deleteButtonText}>Supprimer la tontine</Text>
            </AnimatedPressable>
          </View>
        ) : null}

        <View style={{ height: 24 }} />
      </ScrollView>

      <ConfirmSheet
        visible={startSheetOpen}
        title="Démarrer le cycle"
        description="Lancer le tour 1 et ouvrir les cotisations pour tous les membres ?"
        confirmLabel="Démarrer"
        confirmVariant="primary"
        loading={startingTour}
        onConfirm={confirmStartTour}
        onCancel={() => setStartSheetOpen(false)}
      />

      <ConfirmSheet
        visible={closeSheetOpen}
        title={isLastTour ? 'Clôturer la tontine' : 'Clôturer le tour'}
        description={
          isLastTour
            ? `Verser la cagnotte à ${benefName} et terminer la tontine ?`
            : `Verser la cagnotte à ${benefName} et passer au tour ${currentTour + 1} ?`
        }
        confirmLabel={isLastTour ? 'Terminer' : 'Verser et continuer'}
        confirmVariant="primary"
        loading={closingTour}
        onConfirm={confirmCloseTour}
        onCancel={() => setCloseSheetOpen(false)}
      />
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
  paramsLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
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
  gaugePlaceholder: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: withOpacity(Colors.accent, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 24, color: Colors.gray[900] },
  subtitle: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[500] },
  randomInfoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: Theme.spacing.page,
    marginBottom: 16,
    padding: Theme.spacing.md,
    borderRadius: Theme.radius.md,
    backgroundColor: withOpacity(Colors.info, 0.08),
    borderWidth: 1,
    borderColor: withOpacity(Colors.info, 0.2),
  },
  randomInfoText: {
    flex: 1,
    fontFamily: Fonts.outfit.regular,
    fontSize: 13,
    color: Colors.gray[700],
    lineHeight: 19,
  },
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
  completedBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginHorizontal: Theme.spacing.page,
    marginTop: Theme.spacing.lg,
    marginBottom: Theme.spacing.md,
    padding: Theme.spacing.lg,
    borderRadius: Theme.radius.lg,
    backgroundColor: withOpacity(Colors.success, 0.1),
    borderWidth: 1,
    borderColor: withOpacity(Colors.success, 0.25),
  },
  completedBannerTexts: { flex: 1 },
  completedBannerTitle: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 15,
    color: Colors.gray[900],
    marginBottom: 4,
  },
  completedBannerSub: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 13,
    color: Colors.gray[600],
    lineHeight: 18,
  },
  lifecycleSection: {
    marginHorizontal: Theme.spacing.page,
    marginTop: Theme.spacing.md,
    marginBottom: Theme.spacing.lg,
    gap: 12,
  },
  lifecycleHint: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 13,
    color: Colors.gray[500],
    lineHeight: 18,
    textAlign: 'center',
  },
  archiveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: Theme.radius.md,
    backgroundColor: Theme.screen.surface,
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  archiveButtonText: { fontFamily: Fonts.outfit.medium, fontSize: 15, color: Colors.gray[700] },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    borderRadius: Theme.radius.md,
    backgroundColor: withOpacity(Colors.danger, 0.06),
    borderWidth: 1,
    borderColor: withOpacity(Colors.danger, 0.2),
  },
  deleteButtonText: { fontFamily: Fonts.outfit.medium, fontSize: 15, color: Colors.danger },
  buttonDisabled: { opacity: 0.6 },
});
