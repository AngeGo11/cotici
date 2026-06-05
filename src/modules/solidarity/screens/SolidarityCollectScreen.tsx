import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { AnimatedPressable } from '@/shared/ui';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';
import { useAuth } from '@/shared/auth';
import {
  cotiserSolidarityTontine,
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
      Alert.alert('Participation impossible', result.detail);
      return;
    }
    setModalVisible(false);
    setAmount('');
    await load();
    router.push({
      pathname: '/success',
      params: { type: 'solidarity-contribution', collectId: String(preview.id) },
    });
  };

  const handlePayout = () => {
    if (!preview) return;
    Alert.alert(
      'Valider le versement',
      `Verser ${formatFcfa(preview.montant_collecte)} au bénéficiaire ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Confirmer',
          onPress: () => {
            void (async () => {
              setPayingOut(true);
              const result = await verserSolidarityCollect(preview.id);
              setPayingOut(false);
              if (!result.ok) {
                Alert.alert('Erreur', result.detail);
                return;
              }
              await load();
              Alert.alert(
                'Versement effectué',
                `${result.data.montant_verse} FCFA ont été crédités sur le solde Cotici du bénéficiaire.`,
              );
            })();
          },
        },
      ],
    );
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.brand} />
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

  const statusColor = preview.versement_effectue
    ? Colors.success
    : preview.objectif_atteint
      ? Colors.brand
      : Colors.info;

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

        <View style={[styles.statusPill, { backgroundColor: withOpacity(statusColor, 0.1) }]}>
          <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.statusText, { color: statusColor }]}>{statusLabel}</Text>
        </View>

        <View style={styles.progressCard}>
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
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Feather name="users" size={18} color={Colors.brand} />
            <Text style={styles.statValue}>{preview.nb_contributeurs}</Text>
            <Text style={styles.statLabel}>Contributeurs</Text>
          </View>
          <View style={styles.statCard}>
            <Feather name="shield" size={18} color={Colors.brand} />
            <Text style={styles.statValue} numberOfLines={1}>
              {preview.est_organisateur ? (preview.beneficiaire_nom ?? '—') : 'Privé'}
            </Text>
            <Text style={styles.statLabel}>Bénéficiaire</Text>
          </View>
        </View>

        {!preview.est_organisateur ? (
          <View style={styles.infoBanner}>
            <Feather name="info" size={16} color={Colors.brand} />
            <Text style={styles.infoText}>
              L&apos;identité du bénéficiaire est protégée. Les fonds seront versés sur son solde Cotici
              une fois l&apos;objectif atteint et validé par l&apos;organisateur.
            </Text>
          </View>
        ) : null}

        {preview.peut_cotiser ? (
          <AnimatedPressable style={styles.participateButton} onPress={() => setModalVisible(true)}>
            <Feather name="heart" size={20} color={Colors.white} />
            <Text style={styles.participateButtonText}>Participer</Text>
          </AnimatedPressable>
        ) : null}

        {preview.peut_valider_versement ? (
          <AnimatedPressable
            style={[styles.payoutButton, payingOut && styles.buttonDisabled]}
            onPress={handlePayout}
            disabled={payingOut}
          >
            {payingOut ? (
              <ActivityIndicator color={Colors.white} />
            ) : (
              <>
                <Feather name="check-circle" size={20} color={Colors.white} />
                <Text style={styles.payoutButtonText}>Valider le versement au bénéficiaire</Text>
              </>
            )}
          </AnimatedPressable>
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
          <View style={styles.waitBanner}>
            <Feather name="clock" size={18} color={Colors.info} />
            <Text style={styles.waitText}>
              L&apos;objectif est atteint. En attente de validation par l&apos;organisateur.
            </Text>
          </View>
        ) : null}

        <View style={styles.beneficiaryBlock}>
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
        </View>

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
              <AnimatedPressable style={styles.modalCancel} onPress={() => setModalVisible(false)}>
                <Text style={styles.modalCancelText}>Annuler</Text>
              </AnimatedPressable>
              <AnimatedPressable
                style={[styles.modalConfirm, !canSubmit && styles.buttonDisabled]}
                onPress={handleParticipate}
                disabled={!canSubmit}
              >
                {submitting ? (
                  <ActivityIndicator color={Colors.white} />
                ) : (
                  <Text style={styles.modalConfirmText}>Confirmer</Text>
                )}
              </AnimatedPressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
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
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Theme.radius.pill,
    marginBottom: Theme.spacing.lg,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusText: { fontFamily: Fonts.outfit.medium, fontSize: 13 },
  progressCard: {
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Theme.screen.surface,
    borderRadius: Theme.radius.xl,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.lg,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    ...Theme.shadow.soft,
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
    backgroundColor: Theme.screen.surface,
    borderRadius: Theme.radius.lg,
    padding: Theme.spacing.lg,
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    ...Theme.shadow.soft,
  },
  statValue: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 18, color: Colors.gray[900] },
  statLabel: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500] },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginHorizontal: Theme.spacing.page,
    backgroundColor: withOpacity(Colors.brand, 0.06),
    borderRadius: Theme.radius.lg,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.lg,
    borderWidth: 1,
    borderColor: withOpacity(Colors.brand, 0.15),
  },
  infoText: {
    flex: 1,
    fontFamily: Fonts.outfit.regular,
    fontSize: 13,
    color: Colors.gray[600],
    lineHeight: 18,
  },
  participateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Colors.brand,
    paddingVertical: Theme.spacing.lg,
    borderRadius: Theme.radius.md,
    marginBottom: Theme.spacing.md,
    ...Theme.shadow.soft,
  },
  participateButtonText: { fontFamily: Fonts.outfit.medium, fontSize: 17, color: Colors.white },
  payoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Colors.success,
    paddingVertical: Theme.spacing.lg,
    borderRadius: Theme.radius.md,
    marginBottom: Theme.spacing.md,
  },
  payoutButtonText: { fontFamily: Fonts.outfit.medium, fontSize: 16, color: Colors.white },
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
  waitBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: Theme.spacing.page,
    backgroundColor: withOpacity(Colors.info, 0.08),
    borderRadius: Theme.radius.lg,
    padding: Theme.spacing.lg,
    borderWidth: 1,
    borderColor: withOpacity(Colors.info, 0.15),
  },
  waitText: { flex: 1, fontFamily: Fonts.outfit.regular, fontSize: 13, color: Colors.info, lineHeight: 18 },
  beneficiaryBlock: {
    marginHorizontal: Theme.spacing.page,
    marginTop: Theme.spacing.lg,
    padding: Theme.spacing.lg,
    borderRadius: Theme.radius.lg,
    backgroundColor: Theme.screen.surface,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    ...Theme.shadow.soft,
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
  modalCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: Theme.radius.md,
    alignItems: 'center',
    backgroundColor: Colors.gray[100],
  },
  modalCancelText: { fontFamily: Fonts.outfit.medium, fontSize: 16, color: Colors.gray[700] },
  modalConfirm: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: Theme.radius.md,
    alignItems: 'center',
    backgroundColor: Colors.brand,
  },
  modalConfirmText: { fontFamily: Fonts.outfit.medium, fontSize: 16, color: Colors.white },
});
