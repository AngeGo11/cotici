import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { AnimatedPressable, Button, Card, ConfirmSheet, InfoBanner, Skeleton, StatusBadge } from '@/shared/ui';
import type { StatusTone } from '@/shared/ui';
import * as Haptics from 'expo-haptics';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';
import { useAuth } from '@/shared/auth';
import {
  archiveSolidarityCollect,
  cotiserSolidarityTontine,
  deleteSolidarityCollect,
  fetchSolidarityPreview,
  verserSolidarityCollect,
  type SolidarityCollectPreview,
} from '@/shared/api/solidarityApi';

function formatFcfa(n: number): string {
  return `${n.toLocaleString('fr-FR')} F`;
}

function parsePositiveInt(text: string): number | null {
  const digits = text.replace(/\D/g, '');
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function userBalance(user: { solde_courant?: string | number } | null | undefined): number {
  if (!user?.solde_courant && user?.solde_courant !== 0) return 0;
  const n = typeof user.solde_courant === 'number'
    ? user.solde_courant
    : parseInt(String(user.solde_courant).replace(/\D/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

function formatAmountInput(text: string): string {
  const digits = text.replace(/\D/g, '');
  if (!digits) return '';
  return parseInt(digits, 10).toLocaleString('fr-FR');
}

function ProgressBar({ pct }: { pct: number }) {
  return (
    <View style={styles.progressTrack}>
      <View style={[styles.progressFill, { width: `${Math.min(100, pct)}%` }]} />
    </View>
  );
}

export default function SolidarityCollectScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ id?: string }>();
  const collectId = typeof params.id === 'string' ? params.id : '';

  const [preview, setPreview] = useState<SolidarityCollectPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [payingOut, setPayingOut] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [archiveSheetOpen, setArchiveSheetOpen] = useState(false);
  const [deleteSheetOpen, setDeleteSheetOpen] = useState(false);
  const [payoutSheetOpen, setPayoutSheetOpen] = useState(false);

  const load = useCallback(async () => {
    if (!collectId) {
      setError('Collecte introuvable.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchSolidarityPreview(collectId);
    if (result.ok) {
      setPreview(result.data);
    } else {
      setError(result.detail);
      setPreview(null);
    }
    setLoading(false);
  }, [collectId]);

  useEffect(() => {
    void load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const amountNum = useMemo(() => parsePositiveInt(amount), [amount]);
  const remaining = preview
    ? Math.max(0, preview.objectif_collecte - preview.montant_collecte)
    : 0;
  const canSubmit =
    amountNum !== null &&
    amountNum <= remaining &&
    !submitting &&
    Boolean(preview?.peut_cotiser);

  const handleParticipate = async () => {
    if (!preview || amountNum === null) return;
    setSubmitting(true);
    const result = await cotiserSolidarityTontine({
      tontine_id: preview.id,
      montant: amountNum,
    });
    setSubmitting(false);
    if (!result.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Participation impossible', result.detail);
      return;
    }
    setModalVisible(false);
    setAmount('');
    await load();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    router.push({
      pathname: '/success',
      params: { type: 'solidarity-contribution', collectId: String(preview.id) },
    });
  };

  const handleArchivePress = () => {
    if (!preview) return;
    setArchiveSheetOpen(true);
  };

  const confirmArchive = async () => {
    if (!preview) return;
    setIsArchiving(true);
    const result = await archiveSolidarityCollect(preview.id);
    if (!result.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Erreur', result.detail);
      setIsArchiving(false);
      setArchiveSheetOpen(false);
      return;
    }
    setIsArchiving(false);
    setArchiveSheetOpen(false);
    router.replace('/(tabs)/tontine');
  };

  const handleDeletePress = () => {
    if (!preview) return;
    setDeleteSheetOpen(true);
  };

  const confirmDelete = async () => {
    if (!preview) return;
    setIsArchiving(true);
    const result = await deleteSolidarityCollect(preview.id);
    if (!result.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Erreur', result.detail);
      setIsArchiving(false);
      setDeleteSheetOpen(false);
      return;
    }
    setIsArchiving(false);
    setDeleteSheetOpen(false);
    router.replace('/(tabs)/tontine');
  };

  const handlePayout = () => {
    if (!preview) return;
    setPayoutSheetOpen(true);
  };

  const confirmPayout = async () => {
    if (!preview) return;
    setPayingOut(true);
    const result = await verserSolidarityCollect(preview.id);
    setPayingOut(false);
    if (!result.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
      Alert.alert('Erreur', result.detail);
      setPayoutSheetOpen(false);
      return;
    }
    setPayoutSheetOpen(false);
    await load();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    Alert.alert(
      'Versement effectué',
      `${result.data.montant_verse} FCFA ont été crédités sur le solde Cotici du bénéficiaire.`,
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.heroBlock}>
          <Skeleton shape="circle" width={72} height={72} />
          <View style={{ height: Theme.spacing.lg }} />
          <Skeleton shape="text" width="55%" height={22} />
          <View style={{ height: Theme.spacing.sm }} />
          <Skeleton shape="text" width="40%" height={14} />
        </View>
        <View style={{ paddingHorizontal: Theme.spacing.page, gap: Theme.spacing.md }}>
          <Skeleton shape="card" height={150} />
          <Skeleton shape="card" height={90} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !preview) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <AnimatedPressable style={styles.backButton} onPress={() => router.back()}>
            <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
          </AnimatedPressable>
        </View>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error ?? 'Collecte introuvable.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const statusLabel = preview.versement_effectue
    ? 'Versement effectué'
    : preview.objectif_atteint
      ? 'Objectif atteint'
      : preview.est_active
        ? 'Collecte en cours'
        : 'Collecte clôturée';

  const statusTone: StatusTone = preview.versement_effectue
    ? 'success'
    : preview.objectif_atteint
      ? 'brand'
      : 'info';

  const collectEtat = preview.etat ?? 'ACTIF';
  const isArchivedCollect = collectEtat === 'ARCHIVE';
  const showLifecycleActions =
    preview.est_organisateur &&
    collectEtat === 'ACTIF' &&
    preview.nb_contributeurs === 0 &&
    !preview.versement_effectue;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <AnimatedPressable style={styles.backButton} onPress={() => router.back()}>
            <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
          </AnimatedPressable>
        </View>

        <View style={styles.heroBlock}>
          <View style={styles.heroIconWrap}>
            <Feather name="heart" size={28} color={Colors.brand} />
          </View>
          <Text style={styles.heroTitle}>{preview.motif}</Text>
          <Text style={styles.heroSubtitle}>
            Organisée par {preview.organisateur_nom}
          </Text>
        </View>

        <View style={styles.statusPillWrap}>
          <StatusBadge label={statusLabel} tone={statusTone} />
        </View>

        <Card variant="soft" style={styles.progressCard}>
          <View style={styles.progressHeader}>
            <View>
              <Text style={styles.progressLabel}>Collecté</Text>
              <Text style={styles.progressAmount}>{formatFcfa(preview.montant_collecte)}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.progressLabel}>Objectif</Text>
              <Text style={styles.progressTarget}>{formatFcfa(preview.objectif_collecte)}</Text>
            </View>
          </View>
          <ProgressBar pct={preview.progression_pct} />
          <Text style={styles.progressPct}>{preview.progression_pct}% atteint</Text>
          {remaining > 0 && !preview.objectif_atteint ? (
            <Text style={styles.remainingText}>Il reste {formatFcfa(remaining)} à collecter</Text>
          ) : null}
        </Card>

        <View style={styles.statsRow}>
          <Card variant="soft" style={styles.statCard}>
            <Feather name="users" size={18} color={Colors.brand} />
            <Text style={styles.statValue}>{preview.nb_contributeurs}</Text>
            <Text style={styles.statLabel}>Contributeurs</Text>
          </Card>
          <Card variant="soft" style={styles.statCard}>
            <Feather name="shield" size={18} color={Colors.brand} />
            <Text style={styles.statValue} numberOfLines={1}>
              {preview.est_organisateur ? (preview.beneficiaire_nom ?? '—') : 'Privé'}
            </Text>
            <Text style={styles.statLabel}>Bénéficiaire</Text>
          </Card>
        </View>

        {!preview.est_organisateur ? (
          <InfoBanner
            icon="info"
            tone="info"
            text="L'identité du bénéficiaire est protégée. Les fonds seront versés sur son solde Cotici une fois l'objectif atteint et validé par l'organisateur."
          />
        ) : null}

        {preview.peut_cotiser ? (
          <Button
            label="Participer"
            size="lg"
            leftIcon="heart"
            onPress={() => setModalVisible(true)}
            style={styles.actionButtonWrap}
          />
        ) : null}

        {preview.peut_valider_versement ? (
          <Button
            label="Valider le versement au bénéficiaire"
            size="lg"
            leftIcon="check-circle"
            loading={payingOut}
            onPress={handlePayout}
            style={[styles.actionButtonWrap, styles.payoutButtonColor]}
          />
        ) : null}

        {preview.est_organisateur && !preview.versement_effectue ? (
          <AnimatedPressable
            style={styles.shareLinkButton}
            onPress={() =>
              router.push({
                pathname: '/solidarity-share',
                params: {
                  id: String(preview.id),
                  motif: preview.motif,
                  objectif: String(preview.objectif_collecte),
                },
              })
            }
          >
            <Feather name="share-2" size={18} color={Colors.brand} />
            <Text style={styles.shareLinkText}>Partager la collecte</Text>
          </AnimatedPressable>
        ) : null}

        {preview.est_beneficiaire && preview.objectif_atteint && !preview.versement_effectue ? (
          <InfoBanner
            icon="clock"
            tone="info"
            text="L'objectif est atteint. En attente de validation par l'organisateur."
          />
        ) : null}

        <Card variant="soft" style={styles.beneficiaryBlock}>
          <Text style={styles.beneficiaryEyebrow}>Bénéficiaire</Text>
          {preview.est_organisateur ? (
            <>
              <Text style={styles.beneficiaryName}>
                {preview.beneficiaire_nom ?? 'Compte introuvable'}
              </Text>
              <Text style={styles.beneficiaryPhone}>
                {preview.beneficiaire_telephone ?? '—'}
              </Text>
              <Text style={styles.beneficiaryAdminHint}>
                Visible uniquement par vous, en tant qu&apos;organisateur.
              </Text>
            </>
          ) : (
            <View style={styles.beneficiaryPrivateRow}>
              <Feather name="shield" size={16} color={Colors.gray[500]} />
              <Text style={styles.beneficiaryPrivateText}>Marqué privé</Text>
            </View>
          )}
        </Card>

        {isArchivedCollect ? (
          <InfoBanner icon="archive" tone="neutral" text="Collecte archivée — consultation seule" />
        ) : null}

        {showLifecycleActions ? (
          <View style={styles.lifecycleSection}>
            <AnimatedPressable
              style={[styles.archiveButton, isArchiving && styles.buttonDisabled]}
              onPress={handleArchivePress}
              disabled={isArchiving}
            >
              <Feather name="archive" size={18} color={Colors.gray[700]} />
              <Text style={styles.archiveButtonText}>Archiver la collecte</Text>
            </AnimatedPressable>
            <AnimatedPressable
              style={[styles.deleteButton, isArchiving && styles.buttonDisabled]}
              onPress={handleDeletePress}
              disabled={isArchiving}
            >
              <Feather name="trash-2" size={18} color={Colors.danger} />
              <Text style={styles.deleteButtonText}>Supprimer la collecte</Text>
            </AnimatedPressable>
          </View>
        ) : null}

        <View style={{ height: 40 }} />
      </ScrollView>

      <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView
          style={styles.modalOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalSheet}>
            <Text style={styles.modalTitle}>Votre participation</Text>
            <Text style={styles.modalSub}>
              Solde disponible : {formatFcfa(userBalance(user))}
            </Text>

            <Text style={styles.inputLabel}>Montant (FCFA)</Text>
            <TextInput
              style={styles.input}
              value={amount}
              onChangeText={(t) => setAmount(formatAmountInput(t))}
              placeholder={remaining > 0 ? remaining.toLocaleString('fr-FR') : '5 000'}
              placeholderTextColor={Colors.gray[400]}
              keyboardType="number-pad"
              autoFocus
            />
            {amountNum !== null && amountNum > remaining && remaining > 0 ? (
              <Text style={styles.inputError}>
                Le montant dépasse le reste à collecter ({formatFcfa(remaining)}).
              </Text>
            ) : null}

            <View style={styles.modalActions}>
              <Button
                label="Annuler"
                variant="ghost"
                fullWidth={false}
                style={[styles.modalButtonFlex, styles.modalCancelBg]}
                onPress={() => setModalVisible(false)}
              />
              <Button
                label="Confirmer"
                variant="primary"
                fullWidth={false}
                style={styles.modalButtonFlex}
                disabled={!canSubmit}
                loading={submitting}
                onPress={() => void handleParticipate()}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <ConfirmSheet
        visible={archiveSheetOpen}
        title="Archiver cette collecte"
        description="Elle sera retirée de votre liste active. Vous pourrez toujours consulter son historique."
        confirmLabel="Archiver"
        confirmVariant="secondary"
        loading={isArchiving}
        onConfirm={() => void confirmArchive()}
        onCancel={() => setArchiveSheetOpen(false)}
      />

      <ConfirmSheet
        visible={deleteSheetOpen}
        title="Supprimer cette collecte"
        description="Cette action est définitive. La collecte ne sera plus visible."
        confirmLabel="Supprimer"
        confirmVariant="danger"
        loading={isArchiving}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setDeleteSheetOpen(false)}
      />

      <ConfirmSheet
        visible={payoutSheetOpen}
        title="Valider le versement"
        description={`Verser ${formatFcfa(preview.montant_collecte)} au bénéficiaire ?`}
        confirmLabel="Confirmer"
        confirmVariant="primary"
        loading={payingOut}
        onConfirm={() => void confirmPayout()}
        onCancel={() => setPayoutSheetOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.screen.bg },
  scroll: { paddingBottom: 100 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Theme.spacing.page },
  errorText: { fontFamily: Fonts.outfit.regular, fontSize: 16, color: Colors.danger, textAlign: 'center' },
  header: { paddingHorizontal: Theme.spacing.page, paddingVertical: Theme.spacing.sm },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Theme.screen.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...Theme.shadow.soft,
  },
  heroBlock: {
    paddingHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.lg,
    alignItems: 'center',
  },
  heroIconWrap: {
    width: 72,
    height: 72,
    borderRadius: Theme.radius.lg,
    backgroundColor: withOpacity(Colors.brand, 0.14),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Theme.spacing.lg,
  },
  heroTitle: {
    fontFamily: Fonts.spaceGrotesk.bold,
    fontSize: 26,
    color: Colors.gray[900],
    marginBottom: 8,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    color: Colors.gray[600],
    textAlign: 'center',
  },
  statusPillWrap: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: Theme.spacing.lg,
  },
  progressCard: {
    marginHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.lg,
  },
  progressHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Theme.spacing.md,
  },
  progressLabel: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500], marginBottom: 4 },
  progressAmount: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 28, color: Colors.brand },
  progressTarget: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 20, color: Colors.gray[700] },
  progressTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.gray[100],
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: { height: '100%', backgroundColor: Colors.brand, borderRadius: 5 },
  progressPct: { fontFamily: Fonts.outfit.medium, fontSize: 13, color: Colors.gray[600] },
  remainingText: { fontFamily: Fonts.outfit.regular, fontSize: 13, color: Colors.gray[500], marginTop: 4 },
  statsRow: {
    flexDirection: 'row',
    gap: Theme.spacing.md,
    paddingHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.lg,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    gap: 6,
  },
  statValue: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 18, color: Colors.gray[900] },
  statLabel: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500] },
  actionButtonWrap: {
    marginHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.md,
  },
  payoutButtonColor: {
    backgroundColor: Colors.success,
  },
  shareLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginHorizontal: Theme.spacing.page,
    paddingVertical: Theme.spacing.lg,
    borderRadius: Theme.radius.md,
    borderWidth: 2,
    borderColor: Colors.brand,
    marginBottom: Theme.spacing.md,
  },
  shareLinkText: { fontFamily: Fonts.outfit.medium, fontSize: 16, color: Colors.brand },
  beneficiaryBlock: {
    marginHorizontal: Theme.spacing.page,
    marginTop: Theme.spacing.lg,
    marginBottom: Theme.spacing.lg,
  },
  beneficiaryEyebrow: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 12,
    color: Colors.gray[500],
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: Theme.spacing.sm,
  },
  beneficiaryName: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 16,
    color: Colors.gray[900],
    marginBottom: 4,
  },
  beneficiaryPhone: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 15,
    color: Colors.brand,
    marginBottom: 8,
  },
  beneficiaryAdminHint: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 12,
    color: Colors.gray[500],
    lineHeight: 17,
  },
  beneficiaryPrivateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  beneficiaryPrivateText: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 14,
    color: Colors.gray[600],
  },
  lifecycleSection: {
    marginHorizontal: Theme.spacing.page,
    marginTop: Theme.spacing.lg,
    marginBottom: Theme.spacing.lg,
    gap: 12,
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
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: Theme.screen.surface,
    borderTopLeftRadius: Theme.radius.xl,
    borderTopRightRadius: Theme.radius.xl,
    padding: Theme.spacing.xl,
    paddingBottom: 40,
  },
  modalTitle: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 22, color: Colors.gray[900], marginBottom: 6 },
  modalSub: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[500], marginBottom: 20 },
  inputLabel: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.gray[700], marginBottom: 8 },
  input: {
    backgroundColor: Theme.screen.bg,
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: Fonts.outfit.regular,
    fontSize: 18,
    color: Colors.gray[900],
    marginBottom: 8,
  },
  inputError: { fontFamily: Fonts.outfit.regular, fontSize: 13, color: Colors.danger, marginBottom: 8 },
  modalActions: { flexDirection: 'row', gap: 12, marginTop: 16 },
  modalButtonFlex: { flex: 1 },
  modalCancelBg: { backgroundColor: Colors.gray[100] },
});
