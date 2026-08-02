import { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { AnimatedPressable, Button, ConfirmSheet, InfoBanner, ProgressGauge, Skeleton } from '@/shared/ui';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { archiveSavingsGoal, deleteSavingsGoal, withdrawFromSavings } from '@/shared/api';
import { useAuth } from '@/shared/auth';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';
import { useSavingsDetail } from '@/modules/savings/hooks/useSavingsDetail';

export default function SavingsDetailScreen() {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { detail, loading, error, reload } = useSavingsDetail(id);
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [withdrawSheetOpen, setWithdrawSheetOpen] = useState(false);
  const [archiveSheetOpen, setArchiveSheetOpen] = useState(false);
  const [deleteSheetOpen, setDeleteSheetOpen] = useState(false);

  const percentage = detail?.percentage ?? 0;
  const goalReached = detail ? detail.saved >= detail.target : false;
  const canWithdraw = Boolean(detail?.isActive && goalReached && detail.saved > 0);
  /** Objectif déjà atteint puis épargne retirée vers le solde COTICI */
  const showArchiveDeleteOnly = Boolean(
    detail?.isActive && detail.goalCompleted && detail.saved === 0,
  );
  const showAddAndEdit = Boolean(detail?.isActive && !canWithdraw && !showArchiveDeleteOnly);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <View style={styles.backButton} />
        </View>
        <View style={styles.heroBlock}>
          <Skeleton shape="circle" width={64} height={64} />
          <View style={{ height: Theme.spacing.md }} />
          <Skeleton shape="text" width="50%" height={22} />
        </View>
        <View style={styles.skeletonGaugeWrap}>
          <Skeleton shape="circle" width={200} height={200} />
        </View>
        <View style={{ paddingHorizontal: Theme.spacing.page, gap: Theme.spacing.md }}>
          <Skeleton shape="card" height={100} />
          <Skeleton shape="card" height={80} />
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

  const handleWithdrawPress = () => setWithdrawSheetOpen(true);
  const handleArchivePress = () => setArchiveSheetOpen(true);
  const handleDeletePress = () => setDeleteSheetOpen(true);

  const confirmWithdraw = () => {
    void (async () => {
      setIsWithdrawing(true);
      const result = await withdrawFromSavings(detail.id);
      setWithdrawSheetOpen(false);
      if (!result.ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
        Alert.alert('Erreur', result.detail);
        setIsWithdrawing(false);
        return;
      }
      await refreshUser();
      await reload();
      setIsWithdrawing(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      router.push({
        pathname: '/success',
        params: { type: 'savings-withdraw', ref: result.data.ref_transaction },
      });
    })();
  };

  const confirmArchive = () => {
    void (async () => {
      setIsArchiving(true);
      const result = await archiveSavingsGoal(detail.id);
      setArchiveSheetOpen(false);
      if (!result.ok) {
        Alert.alert('Erreur', result.detail);
        setIsArchiving(false);
        return;
      }
      await refreshUser();
      setIsArchiving(false);
      router.replace('/(tabs)/savings');
    })();
  };

  const confirmDelete = () => {
    void (async () => {
      setIsArchiving(true);
      const result = await deleteSavingsGoal(detail.id);
      setDeleteSheetOpen(false);
      if (!result.ok) {
        Alert.alert('Erreur', result.detail);
        setIsArchiving(false);
        return;
      }
      await refreshUser();
      setIsArchiving(false);
      router.replace('/(tabs)/savings');
    })();
  };

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
          <ProgressGauge
            progress={percentage / 100}
            size={200}
            strokeWidth={14}
            color={Colors.success}
            label={`${percentage}%`}
            sublabel="atteint"
            accessibilityLabel={`Objectif atteint à ${percentage}%`}
          />
        </View>

        {detail.isArchived ? (
          <InfoBanner icon="archive" tone="neutral" text="Objectif archivé — consultation seule" />
        ) : null}

        {canWithdraw ? (
          <InfoBanner
            icon="award"
            tone="success"
            text="Objectif atteint ! Vous pouvez retirer votre épargne vers votre solde disponible."
          />
        ) : null}

        {showArchiveDeleteOnly ? (
          <InfoBanner
            icon="check-circle"
            tone="success"
            text="Objectif terminé. Votre épargne a été retirée. Archivez ou supprimez cet objectif."
          />
        ) : null}

        <View style={styles.amountCard}>
          {detail.withdrawn ? (
            <>
              <View style={styles.amountRow}>
                <View>
                  <Text style={styles.amountLabel}>Objectif atteint</Text>
                  <Text style={styles.amountValue}>{detail.target.toLocaleString('fr-FR')} F</Text>
                </View>
                <View style={styles.trendIcon}>
                  <Feather name="check-circle" size={22} color={Colors.success} />
                </View>
              </View>
              <View style={styles.separator} />
              <View style={styles.amountRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.amountLabel}>Épargne</Text>
                  <Text style={[styles.amountValueDark, styles.withdrawnHint]}>
                    Retirée vers votre solde COTICI
                  </Text>
                </View>
              </View>
            </>
          ) : (
            <>
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
                  <Text style={styles.amountValueBrand}>
                    {detail.remaining.toLocaleString('fr-FR')} F
                  </Text>
                </View>
              </View>
            </>
          )}
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
          {detail.isArchived ? (
            <Button
              label="Voir l'historique"
              variant="ghost"
              leftIcon="clock"
              onPress={() => router.push({ pathname: '/savings-history', params: { id: detail.id } })}
            />
          ) : canWithdraw ? (
            <>
              <Button
                label="Retirer votre épargne"
                variant="primary"
                leftIcon="arrow-down-left"
                loading={isWithdrawing}
                onPress={handleWithdrawPress}
              />
              <Text style={styles.withdrawHint}>
                Les fonds seront crédités sur votre solde COTICI (compte principal).
              </Text>
            </>
          ) : showArchiveDeleteOnly ? (
            <>
              <Button
                label="Archiver l'objectif"
                variant="ghost"
                leftIcon="archive"
                loading={isArchiving}
                onPress={handleArchivePress}
              />
              <Button
                label="Supprimer l'objectif"
                variant="danger"
                leftIcon="trash-2"
                loading={isArchiving}
                onPress={handleDeletePress}
              />
            </>
          ) : showAddAndEdit ? (
            <>
              <Button
                label="Ajouter de l'argent"
                variant="primary"
                leftIcon="plus-circle"
                onPress={() => router.push({ pathname: '/add-to-savings', params: { id: detail.id } })}
              />
              <Button
                label="Modifier l'objectif"
                variant="ghost"
                leftIcon="edit-2"
                onPress={() =>
                  router.push({ pathname: '/modifier-objectif', params: { id: detail.id } })
                }
              />
            </>
          ) : null}
        </View>
      </ScrollView>

      <ConfirmSheet
        visible={withdrawSheetOpen}
        title="Retirer votre épargne"
        description={`Transférer ${detail.saved.toLocaleString('fr-FR')} F vers votre solde COTICI disponible ?`}
        confirmLabel="Confirmer"
        loading={isWithdrawing}
        onConfirm={confirmWithdraw}
        onCancel={() => setWithdrawSheetOpen(false)}
      />

      <ConfirmSheet
        visible={archiveSheetOpen}
        title="Archiver cet objectif"
        description="Il sera retiré de votre liste active. Vous pourrez toujours consulter son historique."
        confirmLabel="Archiver"
        loading={isArchiving}
        onConfirm={confirmArchive}
        onCancel={() => setArchiveSheetOpen(false)}
      />

      <ConfirmSheet
        visible={deleteSheetOpen}
        title="Supprimer cet objectif"
        description="Cette action est définitive. L'objectif ne sera plus visible."
        confirmLabel="Supprimer"
        confirmVariant="danger"
        loading={isArchiving}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteSheetOpen(false)}
      />
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
  skeletonGaugeWrap: {
    alignItems: 'center',
    marginHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.xl,
  },
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
  withdrawnHint: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 15,
    color: Colors.success,
    marginTop: 2,
  },
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
  withdrawHint: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 12,
    color: Colors.gray[500],
    textAlign: 'center',
    marginTop: -4,
  },
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
