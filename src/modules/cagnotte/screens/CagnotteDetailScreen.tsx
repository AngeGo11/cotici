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
  cotiserCagnotte,
  fetchCagnottePreview,
  recuperationCagnotte,
  type CagnottePreview,
} from '@/shared/api/cagnotteApi';

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

export default function CagnotteDetailScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ id?: string }>();
  const cagnotteId = typeof params.id === 'string' ? params.id : '';

  const [preview, setPreview] = useState<CagnottePreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [modalVisible, setModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [payingOut, setPayingOut] = useState(false);
  const [payoutSheetOpen, setPayoutSheetOpen] = useState(false);

  const load = useCallback(async () => {
    if (!cagnotteId) {
      setError('Cagnotte introuvable.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchCagnottePreview(cagnotteId);
    if (result.ok) {
      setPreview(result.data);
    } else {
      setError(result.detail);
      setPreview(null);
    }
    setLoading(false);
  }, [cagnotteId]);

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
    const result = await cotiserCagnotte({
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
      params: { type: 'cagnotte-contribution', collectId: String(preview.id) },
    });
  };

  const handlePayout = () => {
    if (!preview) return;
    setPayoutSheetOpen(true);
  };

  const confirmPayout = async () => {
    if (!preview) return;
    setPayingOut(true);
    const result = await recuperationCagnotte(preview.id);
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
      'Récupération effectuée',
      `${result.data.montant_verse} FCFA ont été crédités sur votre solde Cotici.`,
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
          <Text style={styles.errorText}>{error ?? 'Cagnotte introuvable.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const statusLabel = preview.recuperation_effectue
    ? 'Récupération effectuée'
    : preview.objectif_atteint
      ? 'Objectif atteint'
      : preview.est_active
        ? 'Collecte en cours'
        : 'Collecte clôturée';

  const statusTone: StatusTone = preview.recuperation_effectue
    ? 'success'
    : preview.objectif_atteint
      ? 'brand'
      : 'info';

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
            <Feather name="home" size={28} color={Colors.success} />
          </View>
          <Text style={styles.heroTitle}>{preview.nom_cagnotte}</Text>
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
            <Feather name="users" size={18} color={Colors.success} />
            <Text style={styles.statValue}>{preview.nb_contributeurs}</Text>
            <Text style={styles.statLabel}>Contributeurs</Text>
          </Card>
          <Card variant="soft" style={styles.statCard}>
            <Feather name="user" size={18} color={Colors.success} />
            <Text style={styles.statValue} numberOfLines={1}>{preview.organisateur_nom}</Text>
            <Text style={styles.statLabel}>Organisateur</Text>
          </Card>
        </View>

        {preview.montant_contribue != null ? (
          <InfoBanner
            icon="check-circle"
            tone="success"
            text={`Vous avez déjà contribué ${formatFcfa(preview.montant_contribue)} à cette cagnotte.`}
          />
        ) : null}

        {preview.peut_cotiser ? (
          <Button
            label="Participer"
            size="lg"
            leftIcon="plus-circle"
            onPress={() => setModalVisible(true)}
            style={styles.actionButtonWrap}
          />
        ) : null}

        {preview.peut_valider_versement ? (
          <Button
            label="Récupérer les fonds collectés"
            size="lg"
            leftIcon="check-circle"
            loading={payingOut}
            onPress={handlePayout}
            style={[styles.actionButtonWrap, styles.payoutButtonColor]}
          />
        ) : null}

        {preview.est_organisateur && !preview.recuperation_effectue ? (
          <AnimatedPressable
            style={styles.shareLinkButton}
            onPress={() =>
              router.push({
                pathname: '/cagnotte-share',
                params: {
                  id: String(preview.id),
                  nom: preview.nom_cagnotte,
                  motif: preview.motif,
                  objectif: String(preview.objectif_collecte),
                },
              })
            }
          >
            <Feather name="share-2" size={18} color={Colors.success} />
            <Text style={styles.shareLinkText}>Partager la cagnotte</Text>
          </AnimatedPressable>
        ) : null}

        {preview.est_organisateur && preview.objectif_atteint && !preview.recuperation_effectue ? (
          <InfoBanner
            icon="check-circle"
            tone="info"
            text="L'objectif est atteint. Vous pouvez récupérer les fonds collectés."
          />
        ) : null}

        {!preview.est_organisateur && preview.objectif_atteint && !preview.recuperation_effectue ? (
          <InfoBanner
            icon="clock"
            tone="info"
            text="L'objectif est atteint. En attente de récupération par l'organisateur."
          />
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
        visible={payoutSheetOpen}
        title="Récupérer la collecte"
        description={`Créditer ${formatFcfa(preview.montant_collecte)} sur votre solde Cotici ?`}
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
    backgroundColor: withOpacity(Colors.success, 0.14),
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
  progressAmount: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 28, color: Colors.success },
  progressTarget: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 20, color: Colors.gray[700] },
  progressTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.gray[100],
    overflow: 'hidden',
    marginBottom: 8,
  },
  progressFill: { height: '100%', backgroundColor: Colors.success, borderRadius: 5 },
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
    borderColor: Colors.success,
    marginBottom: Theme.spacing.md,
  },
  shareLinkText: { fontFamily: Fonts.outfit.medium, fontSize: 16, color: Colors.success },
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
