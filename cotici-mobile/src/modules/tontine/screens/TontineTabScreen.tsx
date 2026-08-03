import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { AnimatedPressable } from '@/shared/ui';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';
import { parseTurn } from '@/shared/api';
import { echeanceDepassee, formatEcheance, frequenceUnite } from '@/shared/lib';
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { fetchRecruitingTontines, fetchMyInvitations, tontineSummaryToUi } from '@/shared/api';
import {
  fetchMySolidarityCollects,
  fetchMySolidarityContributions,
  type SolidarityCollectPreview,
} from '@/shared/api/solidarityApi';
import {
  fetchMyCagnotte,
  fetchMyContributionsToCagnotte,
  type CagnottePreview,
} from '@/shared/api/cagnotteApi';
import { useTontines, type TontineListItem } from '@/modules/tontine/hooks/useTontines';

const statusLabel = {
  active: { text: 'Actif', color: Colors.success, bg: withOpacity(Colors.success, 0.12) },
  completed: { text: 'Terminée', color: Colors.success, bg: withOpacity(Colors.success, 0.12) },
  paused: { text: 'En pause', color: Colors.gray[500], bg: withOpacity(Colors.gray[500], 0.12) },
  awaiting: { text: 'Ordre à définir', color: Colors.accent, bg: withOpacity(Colors.accent, 0.12) },
};

function solidarityStatus(collect: SolidarityCollectPreview) {
  if (collect.versement_effectue) {
    return { text: 'Versement effectué', color: Colors.success, bg: withOpacity(Colors.success, 0.12) };
  }
  if (collect.objectif_atteint) {
    return { text: 'Objectif atteint', color: Colors.brand, bg: withOpacity(Colors.brand, 0.12) };
  }
  if (collect.est_active) {
    return { text: 'En cours', color: Colors.info, bg: withOpacity(Colors.info, 0.12) };
  }
  return { text: 'Clôturée', color: Colors.gray[500], bg: withOpacity(Colors.gray[500], 0.12) };
}

function formatFcfa(n: number): string {
  return `${n.toLocaleString('fr-FR')} F`;
}

function SolidarityCollectCard({
  collect,
  contributionAmount,
  onPress,
}: {
  collect: SolidarityCollectPreview;
  contributionAmount?: number;
  onPress: () => void;
}) {
  const badge = solidarityStatus(collect);

  return (
    <AnimatedPressable style={styles.tontineCard} onPress={onPress}>
      <View style={styles.cardTop}>
        <View style={[styles.cardIcon, styles.solidarityIcon]}>
          <Feather name="heart" size={22} color={Colors.brand} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.tontineName} numberOfLines={2}>{collect.motif}</Text>
          <View style={styles.metaRow}>
            <Feather name="user" size={13} color={Colors.gray[500]} />
            <Text style={styles.tontineMembers}>
              {collect.est_organisateur
                ? `Organisée par vous · ${collect.nb_contributeurs} contributeur${collect.nb_contributeurs > 1 ? 's' : ''}`
                : `Par ${collect.organisateur_nom}`}
            </Text>
          </View>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.statusText, { color: badge.color }]}>{badge.text}</Text>
        </View>
      </View>

      <View style={styles.turnBlock}>
        <View style={styles.turnHeader}>
          <Text style={styles.turnLabel}>Collecte</Text>
          <Text style={styles.turnFraction}>{collect.progression_pct}%</Text>
        </View>
        <View style={styles.turnTrack}>
          <View style={[styles.turnFill, { width: `${collect.progression_pct}%` }]} />
        </View>
      </View>

      <View style={styles.cardBottom}>
        <View>
          <Text style={styles.detailLabel}>
            {contributionAmount != null ? 'Votre participation' : 'Collecté / objectif'}
          </Text>
          <Text style={styles.detailValue}>
            {contributionAmount != null
              ? formatFcfa(contributionAmount)
              : `${formatFcfa(collect.montant_collecte)} / ${formatFcfa(collect.objectif_collecte)}`}
          </Text>
        </View>
        <View style={styles.chevronWrap}>
          <Feather name="chevron-right" size={22} color={Colors.gray[400]} />
        </View>
      </View>
    </AnimatedPressable>
  );
}

function cagnotteStatus(cagnotte: CagnottePreview) {
  if (cagnotte.recuperation_effectue) {
    return { text: 'Récupération effectuée', color: Colors.success, bg: withOpacity(Colors.success, 0.12) };
  }
  if (cagnotte.objectif_atteint) {
    return { text: 'Objectif atteint', color: Colors.success, bg: withOpacity(Colors.success, 0.12) };
  }
  if (cagnotte.est_active) {
    return { text: 'En cours', color: Colors.info, bg: withOpacity(Colors.info, 0.12) };
  }
  return { text: 'Clôturée', color: Colors.gray[500], bg: withOpacity(Colors.gray[500], 0.12) };
}

function CagnotteCard({
  cagnotte,
  contributionAmount,
  onPress,
}: {
  cagnotte: CagnottePreview;
  contributionAmount?: number;
  onPress: () => void;
}) {
  const badge = cagnotteStatus(cagnotte);

  return (
    <AnimatedPressable style={styles.tontineCard} onPress={onPress}>
      <View style={styles.cardTop}>
        <View style={[styles.cardIcon, styles.cagnotteIcon]}>
          <Feather name="home" size={22} color={Colors.success} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.tontineName} numberOfLines={2}>{cagnotte.nom_cagnotte}</Text>
          <View style={styles.metaRow}>
            <Feather name="user" size={13} color={Colors.gray[500]} />
            <Text style={styles.tontineMembers}>
              {cagnotte.est_organisateur
                ? `Organisée par vous · ${cagnotte.nb_contributeurs} contributeur${cagnotte.nb_contributeurs > 1 ? 's' : ''}`
                : `Par ${cagnotte.organisateur_nom}`}
            </Text>
          </View>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.statusText, { color: badge.color }]}>{badge.text}</Text>
        </View>
      </View>

      <View style={styles.turnBlock}>
        <View style={styles.turnHeader}>
          <Text style={styles.turnLabel}>Collecte</Text>
          <Text style={styles.turnFraction}>{cagnotte.progression_pct}%</Text>
        </View>
        <View style={styles.turnTrack}>
          <View style={[styles.turnFill, styles.cagnotteFill, { width: `${cagnotte.progression_pct}%` }]} />
        </View>
      </View>

      <View style={styles.cardBottom}>
        <View>
          <Text style={styles.detailLabel}>
            {contributionAmount != null ? 'Votre participation' : 'Collecté / objectif'}
          </Text>
          <Text style={styles.detailValue}>
            {contributionAmount != null
              ? formatFcfa(contributionAmount)
              : `${formatFcfa(cagnotte.montant_collecte)} / ${formatFcfa(cagnotte.objectif_collecte)}`}
          </Text>
        </View>
        <View style={styles.chevronWrap}>
          <Feather name="chevron-right" size={22} color={Colors.gray[400]} />
        </View>
      </View>
    </AnimatedPressable>
  );
}

export default function TontineListScreen() {
  const router = useRouter();
  const { tontines, loading, error, reload } = useTontines();
  const [recruiting, setRecruiting] = useState<TontineListItem[]>([]);
  const [invitationsCount, setInvitationsCount] = useState(0);
  const [organizedCollects, setOrganizedCollects] = useState<SolidarityCollectPreview[]>([]);
  const [contributedCollects, setContributedCollects] = useState<SolidarityCollectPreview[]>([]);
  const [organizedCagnotte, setOrganizedCagnotte] = useState<CagnottePreview[]>([]);
  const [contributedCagnotte, setContributedCagnotte] = useState<CagnottePreview[]>([]);

  const loadRecruiting = useCallback(async () => {
    const result = await fetchRecruitingTontines();
    if (result.ok) {
      setRecruiting(result.data.results.map(tontineSummaryToUi));
    }
  }, []);

  const loadInvitations = useCallback(async () => {
    const result = await fetchMyInvitations();
    if (result.ok) {
      setInvitationsCount(result.data.length);
    }
  }, []);

  const loadSolidarity = useCallback(async () => {
    const [organized, contributed] = await Promise.all([
      fetchMySolidarityCollects(),
      fetchMySolidarityContributions(),
    ]);
    if (organized.ok) setOrganizedCollects(organized.data);
    if (contributed.ok) setContributedCollects(contributed.data);
  }, []);

  const loadCagnotte = useCallback(async () => {
    const [organized, contributed] = await Promise.all([
      fetchMyCagnotte(),
      fetchMyContributionsToCagnotte(),
    ]);
    if (organized.ok) setOrganizedCagnotte(organized.data);
    if (contributed.ok) setContributedCagnotte(contributed.data);
  }, []);

  const openSolidarityCollect = useCallback(
    (id: number) => {
      router.push({
        pathname: '/solidarity-collect/[id]',
        params: { id: String(id) },
      });
    },
    [router],
  );

  const openCagnotteCollect = useCallback(
    (id: number) => {
      router.push({
        pathname: '/cagnotte-collect/[id]',
        params: { id: String(id) },
      });
    },
    [router],
  );

  useFocusEffect(
    useCallback(() => {
      void loadRecruiting();
      void loadInvitations();
      void loadSolidarity();
      void loadCagnotte();
      void reload();
    }, [loadRecruiting, loadInvitations, loadSolidarity, loadCagnotte, reload]),
  );

  const activeTontines = tontines.filter((t) => t.phase !== 'completed');
  const totalCotisations = activeTontines.reduce((s, t) => s + t.amount, 0);
  const avgCyclePct =
    tontines.length > 0
      ? Math.round(tontines.reduce((s, t) => s + t.turnPct, 0) / tontines.length)
      : 0;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.topRow}>
          <View style={styles.titleBlock}>
            <Text style={styles.pageTitle}>Mes tontines</Text>
            <Text style={styles.pageSubtitle}>
              Tontines de groupe et collectes solidaires
            </Text>
          </View>
          <View style={styles.topActions}>
            <AnimatedPressable
              style={styles.iconButton}
              onPress={() => router.push('/invitations')}
              accessibilityLabel="Invitations reçues"
            >
              <Feather name="mail" size={20} color={Colors.brand} />
              {invitationsCount > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{invitationsCount}</Text>
                </View>
              ) : null}
            </AnimatedPressable>
            
          </View>
        </View>

        {invitationsCount > 0 ? (
          <AnimatedPressable
            style={styles.inviteBanner}
            onPress={() => router.push('/invitations')}
          >
            <View style={styles.inviteBannerIcon}>
              <Feather name="user-plus" size={18} color={Colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.inviteBannerTitle}>
                {invitationsCount} invitation{invitationsCount > 1 ? 's' : ''} en attente
              </Text>
              <Text style={styles.inviteBannerText}>
                Rejoignez les groupes auxquels vous êtes invité·e
              </Text>
            </View>
            <Feather name="chevron-right" size={20} color={Colors.gray[400]} />
          </AnimatedPressable>
        ) : null}

        <View style={styles.summaryHero}>
          <Text style={styles.summaryTag}>Vue d&apos;ensemble</Text>
          <View style={styles.summaryRow}>
            <View>
              <Text style={styles.summaryLabel}>Tontines actives</Text>
              <Text style={styles.summaryValue}>{activeTontines.length}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.summaryLabel}>Pot cumulé / cycle</Text>
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

        {recruiting.length > 0 ? (
          <>
            <Text style={styles.sectionEyebrow}>En recrutement</Text>
            {recruiting.map((tontine) => (
              <AnimatedPressable
                key={`rec-${tontine.id}`}
                style={[styles.tontineCard, styles.recruitingCard]}
                onPress={() =>
                  router.push({ pathname: '/tontine-details', params: { id: tontine.id } })
                }
              >
                <View style={styles.cardTop}>
                  <View style={styles.cardIcon}>
                    <Feather name="user-plus" size={22} color={Colors.accent} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tontineName}>{tontine.name}</Text>
                    <Text style={styles.tontineMembers}>
                      {tontine.members}/{tontine.nombreMax} membres — invitez pour compléter
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={22} color={Colors.gray[400]} />
                </View>
              </AnimatedPressable>
            ))}
          </>
        ) : null}

        <Text style={styles.sectionEyebrow}>Vos groupes</Text>

        {loading ? <ActivityIndicator color={Colors.brand} style={styles.loader} /> : null}

        {!loading && error ? (
          <View style={styles.messageCard}>
            <Feather name="alert-circle" size={20} color={Colors.accent} />
            <Text style={styles.messageText}>{error}</Text>
          </View>
        ) : null}

        {!loading && !error && tontines.length === 0 ? (
          <View style={styles.messageCard}>
            <Feather name="inbox" size={20} color={Colors.gray[500]} />
            <Text style={styles.messageText}>
              Aucune tontine de groupe pour le moment. Créez votre premier collectif.
            </Text>
          </View>
        ) : null}

        {tontines.map((tontine) => {
          const isCompleted = tontine.phase === 'completed' || tontine.cycleTermine;
          const flowBadge =
            tontine.phase === 'awaiting_ordre'
              ? statusLabel.awaiting
              : isCompleted
                ? statusLabel.completed
                : tontine.status === 'paused'
                  ? statusLabel.paused
                  : statusLabel.active;
          let displayTurn = tontine.turn;
          if (tontine.phase === 'active' && tontine.ordrePublie && displayTurn.startsWith('0/')) {
            const { total } = parseTurn(displayTurn);
            displayTurn = `1/${total}`;
          }
          const { current, total, pct } = parseTurn(displayTurn);
          const turnPct = isCompleted ? 100 : pct;
          const turnCurrent = isCompleted ? total : current;
          const membresLabel = `${tontine.members}/${tontine.nombreMax} membres`;
          // « par mois », « tous les 5 jours »… null si la fréquence est
          // inconnue ou personnalisée sans nombre de jours.
          const uniteCotisation = frequenceUnite(tontine.frequence, tontine.frequencePersonnalise);
          const echeanceTexte = isCompleted ? null : formatEcheance(tontine.echeance);
          const echeanceEnRetard = echeanceDepassee(tontine.echeance);

          return (
            <AnimatedPressable
              key={tontine.id}
              style={styles.tontineCard}
              onPress={() =>
                router.push({ pathname: '/tontine-details', params: { id: tontine.id } })
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
                <View style={[styles.statusBadge, { backgroundColor: flowBadge.bg }]}>
                  <Text style={[styles.statusText, { color: flowBadge.color }]}>
                    {flowBadge.text}
                  </Text>
                </View>
              </View>

              {tontine.phase === 'awaiting_ordre' ? (
                <View style={styles.awaitingBlock}>
                  <Feather name="list" size={16} color={Colors.accent} />
                  <Text style={styles.awaitingText}>
                    Groupe complet — définissez l&apos;ordre de ramassage pour démarrer
                  </Text>
                </View>
              ) : isCompleted ? (
                <View style={styles.completedBlock}>
                  <Feather name="check-circle" size={16} color={Colors.success} />
                  <Text style={styles.completedText}>
                    Cycle terminé · {total}/{total} tours
                  </Text>
                </View>
              ) : (
                <View style={styles.turnBlock}>
                  <View style={styles.turnHeader}>
                    <Text style={styles.turnLabel}>Cycle en cours</Text>
                    <Text style={styles.turnFraction}>
                      Tour {turnCurrent}/{total}
                    </Text>
                  </View>
                  <View style={styles.turnTrack}>
                    <View style={[styles.turnFill, { width: `${turnPct}%` }]} />
                  </View>
                  {echeanceTexte ? (
                    <View style={styles.echeanceRow}>
                      <Feather
                        name="calendar"
                        size={12}
                        color={echeanceEnRetard ? Colors.danger : Colors.gray[500]}
                      />
                      <Text
                        style={[styles.echeanceText, echeanceEnRetard && styles.echeanceTextLate]}
                      >
                        {echeanceEnRetard ? echeanceTexte : `Échéance : ${echeanceTexte}`}
                      </Text>
                    </View>
                  ) : null}
                </View>
              )}

              <View style={styles.cardBottom}>
                <View>
                  <Text style={styles.detailLabel}>Cotisation</Text>
                  <Text style={styles.detailValue}>
                    {tontine.cotisationAmount.toLocaleString('fr-FR')} F
                    {uniteCotisation ? (
                      <Text style={styles.detailUnit}> {uniteCotisation}</Text>
                    ) : null}
                  </Text>
                </View>
                <View style={styles.chevronWrap}>
                  <Feather name="chevron-right" size={22} color={Colors.gray[400]} />
                </View>
              </View>
            </AnimatedPressable>
          );
        })}

        {organizedCollects.length > 0 ? (
          <>
            <Text style={styles.sectionEyebrow}>Collectes solidaires organisées</Text>
            {organizedCollects.map((collect) => (
              <SolidarityCollectCard
                key={`org-${collect.id}`}
                collect={collect}
                onPress={() => openSolidarityCollect(collect.id)}
              />
            ))}
          </>
        ) : null}

        {contributedCollects.length > 0 ? (
          <>
            <Text style={styles.sectionEyebrow}>Mes participations solidaires</Text>
            {contributedCollects.map((collect) => (
              <SolidarityCollectCard
                key={`contrib-${collect.id}`}
                collect={collect}
                contributionAmount={collect.montant_contribue}
                onPress={() => openSolidarityCollect(collect.id)}
              />
            ))}
          </>
        ) : null}

        {organizedCagnotte.length > 0 ? (
          <>
            <Text style={styles.sectionEyebrow}>Mes cagnottes</Text>
            {organizedCagnotte.map((cagnotte) => (
              <CagnotteCard
                key={`fund-org-${cagnotte.id}`}
                cagnotte={cagnotte}
                onPress={() => openCagnotteCollect(cagnotte.id)}
              />
            ))}
          </>
        ) : null}

        {contributedCagnotte.length > 0 ? (
          <>
            <Text style={styles.sectionEyebrow}>Mes contributions</Text>
            {contributedCagnotte.map((cagnotte) => (
              <CagnotteCard
                key={`fund-contrib-${cagnotte.id}`}
                cagnotte={cagnotte}
                contributionAmount={cagnotte.montant_contribue}
                onPress={() => openCagnotteCollect(cagnotte.id)}
              />
            ))}
          </>
        ) : null}

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
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 },
  iconButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: withOpacity(Colors.brand, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    borderWidth: 2,
    borderColor: Theme.screen.bg,
  },
  badgeText: { fontFamily: Fonts.outfit.bold, fontSize: 10, color: Colors.white },
  inviteBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.lg,
    padding: 14,
    borderRadius: Theme.radius.md,
    backgroundColor: withOpacity(Colors.brand, 0.08),
    borderWidth: 1,
    borderColor: withOpacity(Colors.brand, 0.18),
  },
  inviteBannerIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: withOpacity(Colors.brand, 0.14),
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteBannerTitle: { fontFamily: Fonts.outfit.semiBold, fontSize: 14, color: Colors.gray[900] },
  inviteBannerText: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[600], marginTop: 2 },
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
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Theme.spacing.lg,
  },
  summaryLabel: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 12,
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 4,
  },
  summaryValue: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 26, color: Colors.white },
  summaryTarget: {
    fontFamily: Fonts.spaceGrotesk.bold,
    fontSize: 20,
    color: 'rgba(255,255,255,0.95)',
  },
  globalBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
    overflow: 'hidden',
    marginBottom: Theme.spacing.sm,
  },
  globalBarFill: { height: '100%', borderRadius: 4, backgroundColor: Colors.white },
  summaryHint: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: 'rgba(255,255,255,0.8)' },
  sectionEyebrow: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 13,
    color: Colors.gray[500],
    paddingHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.md,
    letterSpacing: 0.2,
  },
  loader: { marginVertical: Theme.spacing.xl },
  messageCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Theme.spacing.md,
    marginHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.lg,
    padding: Theme.spacing.lg,
    borderRadius: Theme.radius.lg,
    backgroundColor: Theme.screen.surface,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    ...Theme.shadow.soft,
  },
  messageText: {
    flex: 1,
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    color: Colors.gray[600],
    lineHeight: 20,
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
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.md,
    marginBottom: Theme.spacing.md,
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: Theme.radius.sm,
    backgroundColor: withOpacity(Colors.brand, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  solidarityIcon: {
    backgroundColor: withOpacity(Colors.brand, 0.14),
  },
  cagnotteIcon: {
    backgroundColor: withOpacity(Colors.success, 0.14),
  },
  cagnotteFill: {
    backgroundColor: Colors.success,
  },
  tontineName: {
    fontFamily: Fonts.spaceGrotesk.bold,
    fontSize: 17,
    color: Colors.gray[900],
    marginBottom: 4,
  },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tontineMembers: { fontFamily: Fonts.outfit.regular, fontSize: 13, color: Colors.gray[500] },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontFamily: Fonts.outfit.medium, fontSize: 11 },
  awaitingBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
    backgroundColor: withOpacity(Colors.accent, 0.08),
    padding: Theme.spacing.md,
    borderRadius: Theme.radius.sm,
    marginBottom: Theme.spacing.md,
  },
  awaitingText: {
    flex: 1,
    fontFamily: Fonts.outfit.regular,
    fontSize: 13,
    color: Colors.gray[700],
    lineHeight: 18,
  },
  completedBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.sm,
    backgroundColor: withOpacity(Colors.success, 0.08),
    padding: Theme.spacing.md,
    borderRadius: Theme.radius.sm,
    marginBottom: Theme.spacing.md,
  },
  completedText: {
    flex: 1,
    fontFamily: Fonts.outfit.medium,
    fontSize: 13,
    color: Colors.gray[700],
    lineHeight: 18,
  },
  turnBlock: { marginBottom: Theme.spacing.md },
  turnHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  turnLabel: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500] },
  turnFraction: { fontFamily: Fonts.outfit.medium, fontSize: 12, color: Colors.gray[700] },
  turnTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.gray[100],
    overflow: 'hidden',
  },
  turnFill: { height: '100%', borderRadius: 3, backgroundColor: Colors.brand },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: Theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[100],
  },
  detailLabel: { fontFamily: Fonts.outfit.regular, fontSize: 11, color: Colors.gray[500], marginBottom: 2 },
  detailValue: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 16, color: Colors.gray[900] },
  detailUnit: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500] },
  echeanceRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8 },
  echeanceText: { fontFamily: Fonts.outfit.medium, fontSize: 12, color: Colors.gray[600] },
  echeanceTextLate: { color: Colors.danger },
  chevronWrap: { padding: 4 },
  recruitingCard: {
    borderColor: withOpacity(Colors.accent, 0.35),
    backgroundColor: withOpacity(Colors.accent, 0.04),
  },
});
