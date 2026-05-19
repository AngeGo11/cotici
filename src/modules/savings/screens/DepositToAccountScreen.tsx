import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
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
import { PaymentProviderMark } from '@/components/PaymentProviderMark';
import type { PaymentProvider } from '@/types';
import { parseBalance, submitWalletDeposit } from '@/shared/api';
import { formatMonthlyFlow, useAuth } from '@/shared/auth';
import { getAccessToken } from '@/shared/auth/tokenStorage';

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

    const accessToken = await getAccessToken();
    if (!accessToken) {
      setErrorMessage('Session expirée. Reconnectez-vous.');
      setIsSubmitting(false);
      return;
    }

    const result = await submitWalletDeposit(accessToken, {
      amount: amountNum,
      provider: selectedProvider,
    });

    if (!result.ok) {
      setErrorMessage(result.detail);
      setIsSubmitting(false);
      return;
    }

    await refreshUser();
    setIsSubmitting(false);
    router.push({
      pathname: '/success',
      params: { type: 'deposit', ref: result.data.ref_transaction },
    });
  };

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
          {providers.map((p) => {
            const selected = selectedProvider === p.id;
            return (
              <AnimatedPressable
                key={p.id}
                style={[styles.providerRow, selected && styles.providerRowSelected]}
                onPress={() => setSelectedProvider(p.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${p.name}, Mobile Money`}
              >
                <View style={styles.providerRowLogo}>
                  <PaymentProviderMark providerId={p.id} maxWidth={64} maxHeight={28} />
                </View>
                <View style={styles.providerRowDivider} />
                <View style={styles.providerRowText}>
                  <Text style={styles.providerRowTitle} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Text style={styles.providerRowSubtitle}>Mobile Money</Text>
                </View>
                <View style={[styles.radioOuter, selected && styles.radioOuterOn]}>
                  {selected ? <View style={styles.radioInner} /> : null}
                </View>
              </AnimatedPressable>
            );
          })}
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

        <AnimatedPressable
          style={[styles.confirmButton, !canSubmit && styles.confirmDisabled]}
          disabled={!canSubmit}
          onPress={() => void handleConfirmDeposit()}
        >
          {isSubmitting ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={[styles.confirmText, !canSubmit && styles.confirmTextDisabled]}>
              Confirmer le dépôt
            </Text>
          )}
        </AnimatedPressable>
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
  /** Liste type « carte de paiement » : logo | séparateur | libellés | radio */
  providerList: {
    paddingHorizontal: Theme.spacing.page,
    gap: Theme.spacing.md,
    marginBottom: Theme.spacing.xl,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.screen.surface,
    borderRadius: Theme.radius.lg,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    paddingVertical: 14,
    paddingLeft: Theme.spacing.lg,
    paddingRight: Theme.spacing.md,
    minHeight: 72,
    ...Theme.shadow.soft,
  },
  providerRowSelected: {
    borderColor: Colors.gray[900],
    borderWidth: 1.5,
  },
  providerRowLogo: {
    width: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerRowDivider: {
    width: 1,
    height: 40,
    backgroundColor: Colors.gray[200],
    marginHorizontal: Theme.spacing.md,
  },
  providerRowText: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    gap: 4,
  },
  providerRowTitle: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 16,
    lineHeight: 22,
    color: Colors.gray[900],
    letterSpacing: -0.2,
  },
  providerRowSubtitle: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.gray[500],
  },
  radioOuter: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.gray[300],
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: Theme.spacing.sm,
  },
  radioOuterOn: {
    borderColor: Colors.gray[900],
  },
  radioInner: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.gray[900],
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
  confirmButton: {
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Colors.brand,
    paddingVertical: 18,
    borderRadius: Theme.radius.md,
    alignItems: 'center',
    ...Theme.shadow.soft,
  },
  confirmDisabled: { backgroundColor: Colors.gray[200], shadowOpacity: 0, elevation: 0 },
  confirmText: { fontFamily: Fonts.outfit.semiBold, fontSize: 17, letterSpacing: 0.2, color: Colors.white },
  confirmTextDisabled: { color: Colors.gray[400] },
});
