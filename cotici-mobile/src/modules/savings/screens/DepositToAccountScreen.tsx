import { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { AnimatedPressable, Button, SelectableRow } from '@/shared/ui';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';
import { PaymentProviderMark } from '@/components/PaymentProviderMark';
import type { PaymentProvider } from '@/types';
import {
  fetchTransactionStatus,
  parseBalance,
  submitWalletDeposit,
  type WalletTransactionStatus,
} from '@/shared/api';
import { formatMonthlyFlow, useAuth } from '@/shared/auth';

/**
 * Poll interval/attempts pour la confirmation CinetPay : le webhook backend est
 * asynchrone (quelques secondes à quelques minutes). On sonde `~30s` avant de
 * renvoyer l'utilisateur vers un écran "en attente" plutôt que de bloquer indéfiniment.
 */
const POLL_INTERVAL_MS = 2500;
const POLL_MAX_ATTEMPTS = 12;

/**
 * Sonde le statut d'une transaction jusqu'à obtenir un état terminal
 * (`RÉUSSIE`/`ÉCHOUÉE`/`ANNULÉE`) ou épuiser les tentatives. Vérifie `isMountedRef`
 * avant chaque `await` pour éviter tout `setState` après démontage de l'écran.
 */
async function pollDepositStatus(
  ref: string,
  isMountedRef: { current: boolean },
): Promise<WalletTransactionStatus | null> {
  for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt += 1) {
    if (!isMountedRef.current) return null;
    const result = await fetchTransactionStatus(ref);
    if (!isMountedRef.current) return null;
    if (result.ok && result.data?.statut_transaction) {
      const status = result.data.statut_transaction as WalletTransactionStatus;
      if (status === 'RÉUSSIE' || status === 'ÉCHOUÉE' || status === 'ANNULÉE') {
        return status;
      }
    }
    if (attempt < POLL_MAX_ATTEMPTS - 1) {
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      if (!isMountedRef.current) return null;
    }
  }
  return 'EN ATTENTE';
}

const providers = [
  { id: 'orange' as const, name: 'Orange Money' },
  { id: 'mtn' as const, name: 'MTN MoMo' },
  { id: 'wave' as const, name: 'Wave' },
  { id: 'moov' as const, name: 'Moov Money' },
];

const quickAmounts = [5000, 10000, 25000, 50000, 100000];

/** Montants entiers, espaces insécables (locale FR). */
function formatMoney(amount: number): string {
  return Math.round(amount).toLocaleString('fr-FR', { maximumFractionDigits: 0 });
}

const tabularAmount = { fontVariant: ['tabular-nums' as const] };

export default function DepositToAccountScreen() {
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const [selectedProvider, setSelectedProvider] = useState<PaymentProvider>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const currentBalance = parseBalance(user?.solde_courant);
  const amountNum = depositAmount ? Number(depositAmount.replace(/\s/g, '')) : 0;
  const isValidAmount = !Number.isNaN(amountNum) && amountNum > 0;
  const previewNew =
    depositAmount && isValidAmount ? currentBalance + amountNum : null;
  const canSubmit = Boolean(selectedProvider && isValidAmount && !isSubmitting);

  useEffect(() => {
    if (user?.numero_telephone && !phoneNumber) {
      setPhoneNumber(user.numero_telephone);
    }
  }, [user?.numero_telephone, phoneNumber]);

  const handleConfirmDeposit = async () => {
    if (!selectedProvider || !isValidAmount || isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage('');

    const result = await submitWalletDeposit({
      amount: amountNum,
      provider: selectedProvider,
    });

    if (!result.ok) {
      setErrorMessage(result.detail);
      setIsSubmitting(false);
      return;
    }

    const { data } = result;

    if (data.payment_url) {
      // Mode CinetPay réel : le wallet n'est pas encore crédité. L'utilisateur
      // paie sur la page CinetPay, puis on sonde le statut jusqu'à confirmation
      // (le webhook backend est asynchrone).
      // Note : on ne connaît pas de deep-link de retour garanti côté CinetPay,
      // on ouvre donc un navigateur classique plutôt que openAuthSessionAsync
      // (qui suppose un redirect vers le scheme de l'app) — à valider sur device
      // réel avec un compte CinetPay de test.
      try {
        await WebBrowser.openBrowserAsync(data.payment_url);
      } catch {
        // navigateur fermé/indisponible : on tente quand même la confirmation.
      }
      if (!isMountedRef.current) return;

      setIsSubmitting(false);
      setConfirmingPayment(true);
      const finalStatus = await pollDepositStatus(data.ref_transaction, isMountedRef);
      if (!isMountedRef.current) return;
      setConfirmingPayment(false);

      if (finalStatus === 'RÉUSSIE') {
        await refreshUser();
        if (!isMountedRef.current) return;
        router.push({
          pathname: '/success',
          params: { type: 'deposit', ref: data.ref_transaction },
        });
        return;
      }

      if (finalStatus === 'ÉCHOUÉE' || finalStatus === 'ANNULÉE') {
        setErrorMessage(
          "Le paiement n'a pas abouti. Aucun montant n'a été crédité sur votre compte. Vous pouvez réessayer.",
        );
        return;
      }

      // Toujours "EN ATTENTE" (ou statut introuvable) après le délai imparti :
      // le webhook n'a pas encore confirmé, on informe sans bloquer l'utilisateur.
      router.push({
        pathname: '/success',
        params: { type: 'deposit-pending', ref: data.ref_transaction },
      });
      return;
    }

    // Mode sandbox (ou tout mode où le crédit est immédiat) : comportement
    // historique inchangé, `nouveau_solde` est déjà à jour côté serveur.
    await refreshUser();
    if (!isMountedRef.current) return;
    setIsSubmitting(false);
    router.push({
      pathname: '/success',
      params: { type: 'deposit', ref: data.ref_transaction },
    });
  };

  if (confirmingPayment) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.confirmingWrap}>
          <ActivityIndicator color={Colors.brand} size="large" />
          <Text style={styles.confirmingTitle}>Confirmation du paiement en cours…</Text>
          <Text style={styles.confirmingSubtitle}>
            Nous attendons la confirmation de votre opérateur Mobile Money. Cela peut
            prendre jusqu'à une minute, merci de patienter.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <AnimatedPressable style={styles.backButton} onPress={() => router.back()}>
            <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
          </AnimatedPressable>
        </View>

        <View style={styles.titleBlock}>
          <View style={styles.titleRow}>
            <View style={styles.titleIcon}>
              <Feather name="arrow-down-left" size={24} color={Colors.brand} />
            </View>
            <View style={styles.titleTextWrap}>
              <Text style={styles.title}>Recharger mon compte</Text>
              <Text style={styles.subtitle}>
                {"Ajoutez de l'argent à votre solde COTICI"}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.balanceHero}>
          <Text style={styles.balanceTag}>Compte principal</Text>
          <Text style={styles.balanceLabel}>Solde actuel</Text>
          <Text style={[styles.balanceValue, tabularAmount]}>
            {`${formatMoney(currentBalance)}\u202f`}
            <Text style={styles.balanceCurrency}>FCFA</Text>
          </Text>
          <Text style={styles.balanceHint}>
            Entrées ce mois{' '}
            <Text style={[styles.balanceHintEm, tabularAmount]}>
              {formatMonthlyFlow(user?.entrees_ce_mois, 'in').replace(' F', ' FCFA')}
            </Text>
          </Text>
        </View>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionEyebrow}>Montant</Text>
        </View>
        <View style={styles.surfaceCard}>
          <Text style={styles.inCardLabel}>Combien souhaitez-vous ajouter ?</Text>
          <View style={styles.amountInputRow}>
            <TextInput
              style={[styles.amountInput, tabularAmount]}
              value={depositAmount}
              onChangeText={setDepositAmount}
              placeholder="0"
              placeholderTextColor={Colors.gray[400]}
              keyboardType="number-pad"
            />
            <Text style={styles.unit}>FCFA</Text>
          </View>
          <Text style={styles.quickLabel}>Montants rapides</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickRow}
          >
            {quickAmounts.map((a) => {
              const selected = depositAmount === a.toString();
              return (
                <AnimatedPressable
                  key={a}
                  style={[styles.quickChip, selected && styles.quickChipSelected]}
                  onPress={() => setDepositAmount(a.toString())}
                >
                  <Text style={[styles.quickChipText, selected && styles.quickChipTextSelected, tabularAmount]}>
                    {formatMoney(a)} F
                  </Text>
                </AnimatedPressable>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionEyebrow}>Opérateur Mobile Money</Text>
          <Text style={styles.sectionHint}>Sélectionnez le compte depuis lequel vous payez</Text>
        </View>
        <View style={styles.providerList}>
          {providers.map((p) => (
            <SelectableRow
              key={p.id}
              leading={<PaymentProviderMark providerId={p.id} maxWidth={64} maxHeight={28} />}
              title={p.name}
              subtitle="Mobile Money"
              selected={selectedProvider === p.id}
              onPress={() => setSelectedProvider(p.id)}
            />
          ))}
        </View>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionEyebrow}>Numéro du compte</Text>
        </View>
        <View style={styles.surfaceCard}>
          <Text style={styles.inCardLabel}>Téléphone utilisé pour le paiement</Text>
          <TextInput
            style={[styles.inputBare, tabularAmount]}
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            keyboardType="phone-pad"
            placeholder="+225 …"
            placeholderTextColor={Colors.gray[400]}
          />
        </View>

        {previewNew !== null ? (
          <View style={styles.previewCard}>
            <Text style={styles.previewEyebrow}>Après ce dépôt</Text>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>Nouveau solde</Text>
              <Text style={[styles.previewValue, tabularAmount]}>
                {formatMoney(previewNew)}
                <Text style={styles.previewCurrency}> FCFA</Text>
              </Text>
            </View>
          </View>
        ) : null}

        {errorMessage ? (
          <View style={styles.errorCard}>
            <Feather name="alert-circle" size={20} color={Colors.accent} />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <View style={styles.securityPill}>
          <Feather name="shield" size={16} color={Colors.success} />
          <Text style={styles.securityText}>
            Paiement sécurisé{' '}
            <Text style={styles.securityEm}>·</Text>
            {' '}données chiffrées
          </Text>
        </View>

        <Button
          label="Confirmer le dépôt"
          size="lg"
          leftIcon="arrow-down-left"
          disabled={!canSubmit}
          loading={isSubmitting}
          onPress={() => void handleConfirmDeposit()}
          style={styles.confirmButtonWrap}
        />
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.screen.bg },
  scroll: { paddingBottom: 100 },
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
  titleBlock: { paddingHorizontal: Theme.spacing.page, marginBottom: Theme.spacing.lg },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Theme.spacing.md },
  titleIcon: {
    width: 52,
    height: 52,
    borderRadius: Theme.radius.md,
    backgroundColor: withOpacity(Colors.brand, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleTextWrap: { flex: 1 },
  title: {
    fontFamily: Fonts.spaceGrotesk.bold,
    fontSize: 26,
    color: Colors.gray[900],
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  subtitle: { fontFamily: Fonts.outfit.regular, fontSize: 15, color: Colors.gray[600], lineHeight: 22 },
  balanceHero: {
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Colors.brand,
    borderRadius: Theme.radius.xl,
    padding: Theme.spacing.xl,
    marginBottom: Theme.spacing.xl,
    ...Theme.shadow.brandHero,
  },
  balanceTag: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 0.8,
    marginBottom: Theme.spacing.sm,
    textTransform: 'uppercase',
  },
  balanceLabel: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 13,
    color: 'rgba(255,255,255,0.88)',
    marginBottom: 6,
    letterSpacing: 0.15,
  },
  balanceValue: {
    fontFamily: Fonts.spaceGrotesk.bold,
    fontSize: 34,
    color: Colors.white,
    letterSpacing: -0.5,
  },
  balanceCurrency: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 17,
    color: 'rgba(255,255,255,0.92)',
    letterSpacing: 1.2,
  },
  balanceHint: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 12,
    lineHeight: 17,
    color: 'rgba(255,255,255,0.68)',
    marginTop: Theme.spacing.md,
  },
  balanceHintEm: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
  },
  sectionHead: {
    paddingHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.sm,
  },
  sectionEyebrow: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 12,
    color: Colors.gray[600],
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginBottom: Theme.spacing.xs,
  },
  sectionHint: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 13,
    lineHeight: 19,
    color: Colors.gray[500],
    marginTop: 2,
    marginBottom: 0,
  },
  surfaceCard: {
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Theme.screen.surface,
    borderRadius: Theme.radius.lg,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.xl,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    ...Theme.shadow.card,
  },
  inCardLabel: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.gray[900],
    marginBottom: Theme.spacing.md,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray[50],
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    marginBottom: Theme.spacing.lg,
  },
  amountInput: {
    flex: 1,
    paddingHorizontal: Theme.spacing.lg,
    paddingVertical: 18,
    fontFamily: Fonts.spaceGrotesk.bold,
    fontSize: 28,
    color: Colors.gray[900],
    letterSpacing: -0.3,
  },
  unit: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 13,
    color: Colors.gray[500],
    paddingRight: Theme.spacing.lg,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  quickLabel: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 11,
    color: Colors.gray[500],
    marginBottom: Theme.spacing.sm,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  quickRow: { flexDirection: 'row', gap: Theme.spacing.sm, flexWrap: 'wrap' },
  quickChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Theme.radius.sm,
    backgroundColor: Colors.gray[50],
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  quickChipSelected: {
    borderColor: Colors.brand,
    backgroundColor: withOpacity(Colors.brand, 0.08),
  },
  quickChipText: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 13,
    letterSpacing: -0.2,
    color: Colors.gray[700],
  },
  quickChipTextSelected: { color: Colors.brand },
  /** Sélection d'opérateur Mobile Money : voir SelectableRow (@/shared/ui). */
  providerList: {
    paddingHorizontal: Theme.spacing.page,
    gap: Theme.spacing.md,
    marginBottom: Theme.spacing.xl,
  },
  inputBare: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 16,
    lineHeight: 22,
    letterSpacing: 0.2,
    color: Colors.gray[900],
    paddingVertical: 14,
    paddingHorizontal: Theme.spacing.md,
    backgroundColor: Colors.gray[50],
    borderRadius: Theme.radius.sm,
    borderWidth: 1,
    borderColor: Colors.gray[100],
  },
  previewCard: {
    marginHorizontal: Theme.spacing.page,
    backgroundColor: withOpacity(Colors.success, 0.1),
    borderRadius: Theme.radius.lg,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.xl,
    borderWidth: 1,
    borderColor: withOpacity(Colors.success, 0.25),
    ...Theme.shadow.soft,
  },
  previewEyebrow: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 11,
    color: Colors.gray[600],
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 },
  previewLabel: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.gray[600],
    flex: 1,
    flexShrink: 1,
  },
  previewValue: {
    fontFamily: Fonts.spaceGrotesk.bold,
    fontSize: 22,
    color: Colors.success,
    letterSpacing: -0.35,
    textAlign: 'right',
  },
  previewCurrency: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 14,
    color: Colors.success,
    letterSpacing: 0.6,
    opacity: 0.92,
  },
  securityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'center',
    paddingHorizontal: Theme.spacing.lg,
    paddingVertical: 10,
    borderRadius: Theme.radius.pill,
    backgroundColor: withOpacity(Colors.success, 0.08),
    marginBottom: Theme.spacing.xl,
  },
  securityText: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 12,
    lineHeight: 16,
    color: Colors.gray[600],
    textAlign: 'center',
  },
  securityEm: { color: Colors.gray[400], paddingHorizontal: 2 },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Theme.spacing.md,
    marginHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.lg,
    padding: Theme.spacing.lg,
    borderRadius: Theme.radius.lg,
    backgroundColor: withOpacity(Colors.accent, 0.1),
    borderWidth: 1,
    borderColor: withOpacity(Colors.accent, 0.25),
  },
  errorText: {
    flex: 1,
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.gray[700],
  },
  confirmButtonWrap: {
    marginHorizontal: Theme.spacing.page,
  },
  confirmingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Theme.spacing.xl,
    gap: Theme.spacing.md,
  },
  confirmingTitle: {
    fontFamily: Fonts.spaceGrotesk.bold,
    fontSize: 20,
    color: Colors.gray[900],
    textAlign: 'center',
    marginTop: Theme.spacing.md,
  },
  confirmingSubtitle: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.gray[600],
    textAlign: 'center',
  },
});
