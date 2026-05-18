import { useState } from 'react';
import { 
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
 } from 'react-native';
import { AnimatedPressable } from '@/shared/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';
import { PaymentProviderMark } from '@/components/PaymentProviderMark';
import type { PaymentProvider } from '@/types';

const FEE_F = 0;
const DEFAULT_PAY_AMOUNT_F = 10_000;

const providers = [
  { id: 'orange' as const, name: 'Orange Money', bg: Colors.provider.orange, text: Colors.white },
  { id: 'mtn' as const, name: 'MTN MoMo', bg: Colors.provider.mtn, text: Colors.gray[900] },
  { id: 'wave' as const, name: 'Wave', bg: Colors.provider.wave, text: Colors.white },
  { id: 'moov' as const, name: 'Moov Money', bg: Colors.provider.moov, text: Colors.white },
];

/** Montants entiers, espaces insécables (locale FR). */
function formatMoney(amount: number): string {
  return Math.round(amount).toLocaleString('fr-FR', { maximumFractionDigits: 0 });
}

const tabularAmount = { fontVariant: ['tabular-nums' as const] };

export default function MakeDepositScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    tontineId?: string;
    tontineName?: string;
    turn?: string;
    amount?: string;
  }>();
  const [selectedProvider, setSelectedProvider] = useState<PaymentProvider>(null);
  const [phoneNumber, setPhoneNumber] = useState('+225 07 08 09 10 11');

  const tontineName =
    typeof params.tontineName === 'string' && params.tontineName
      ? params.tontineName
      : 'Tontine';
  const tourNumber =
    typeof params.turn === 'string' && params.turn ? params.turn : '3';
  const parsedAmount = params.amount ? Number(params.amount) : NaN;
  const payAmount =
    Number.isFinite(parsedAmount) && parsedAmount > 0
      ? parsedAmount
      : DEFAULT_PAY_AMOUNT_F;
  const payMotif = `Cotisation — ${tontineName} — Tour ${tourNumber}`;

  const total = payAmount + FEE_F;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <AnimatedPressable style={styles.backButton} onPress={() => router.back()} >
            <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
          </AnimatedPressable>
        </View>

        <View style={styles.titleBlock}>
          <View style={styles.titleRow}>
            <View style={styles.titleIcon}>
              <Feather name="credit-card" size={24} color={Colors.success} />
            </View>
            <View style={styles.titleTextWrap}>
              <Text style={styles.title}>Effectuer un dépôt</Text>
              <Text style={styles.subtitle}>Réglez votre cotisation depuis votre Mobile Money</Text>
            </View>
          </View>
        </View>

        <View style={styles.payHero}>
          <Text style={styles.payTag}>Paiement à effectuer</Text>
          <View style={styles.payTopRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.payLabel}>Motif</Text>
              <Text style={styles.payMotif}>{payMotif}</Text>
            </View>
            <View style={styles.payMotifIcon}>
              <Feather name="users" size={22} color={Colors.success} />
            </View>
          </View>
          <View style={styles.payDivider} />
          <Text style={styles.payAmountLabel}>Montant</Text>
          <Text style={[styles.payAmount, tabularAmount]}>
            {`${formatMoney(payAmount)}\u202f`}
            <Text style={styles.payAmountCurrency}>FCFA</Text>
          </Text>
        </View>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionEyebrow}>Opérateur Mobile Money</Text>
          <Text style={styles.sectionHint}>Sélectionnez le compte depuis lequel vous payez</Text>
        </View>
        <View style={styles.providerGrid}>
          {providers.map((p) => {
            const selected = selectedProvider === p.id;
            return (
              <AnimatedPressable
                key={p.id}
                style={[styles.providerCell, selected && styles.providerCellSelected]}
                onPress={() => setSelectedProvider(p.id)} accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={`${p.name}, Mobile Money`}
              >
                <View style={[styles.providerBrandStripe, { backgroundColor: p.bg }]} />
                <View style={styles.providerCellLogo}>
                  <PaymentProviderMark providerId={p.id} maxWidth={76} maxHeight={26} />
                </View>
                <View style={styles.providerCellText}>
                  <Text style={styles.providerCellTitle} numberOfLines={2}>
                    {p.name}
                  </Text>
                  <Text style={styles.providerCellSubtitle}>Mobile Money</Text>
                </View>
                <View style={[styles.radioOuter, selected && styles.radioOuterOn]}>
                  {selected ? <View style={styles.radioInner} /> : null}
                </View>
              </AnimatedPressable>
            );
          })}
        </View>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionEyebrow}>Compte débité</Text>
        </View>
        <View style={styles.surfaceCard}>
          <Text style={styles.inCardLabel}>Numéro de téléphone lié au portefeuille</Text>
          <TextInput
            style={[styles.inputBare, tabularAmount]}
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            placeholder="+225 …"
            placeholderTextColor={Colors.gray[400]}
            keyboardType="phone-pad"
          />
        </View>

        <View style={styles.recapCard}>
          <Text style={styles.recapEyebrow}>Récapitulatif</Text>
          <View style={styles.recapRow}>
            <Text style={styles.recapLabel}>Montant cotisation</Text>
            <Text style={[styles.recapValueNum, tabularAmount]}>
              {formatMoney(payAmount)}
              <Text style={styles.recapValueCurrency}> FCFA</Text>
            </Text>
          </View>
          <View style={styles.recapRow}>
            <Text style={styles.recapLabel}>Frais</Text>
            <Text style={[styles.recapValueNum, tabularAmount]}>
              {formatMoney(FEE_F)}
              <Text style={styles.recapValueCurrency}> FCFA</Text>
            </Text>
          </View>
          <View style={styles.recapDivider} />
          <View style={styles.recapRow}>
            <Text style={styles.recapTotal}>Total à payer</Text>
            <Text style={[styles.recapTotalValue, tabularAmount]}>
              {formatMoney(total)}
              <Text style={styles.recapTotalCurrency}> FCFA</Text>
            </Text>
          </View>
        </View>

        <View style={styles.securityPill}>
          <Feather name="shield" size={16} color={Colors.success} />
          <Text style={styles.securityText}>
            Transaction sécurisée{' '}
            <Text style={styles.securityEm}>·</Text>
            {' '}données chiffrées
          </Text>
        </View>

        <AnimatedPressable
          style={[styles.confirmButton, !selectedProvider && styles.confirmDisabled]}
          disabled={!selectedProvider}
          onPress={() => router.push({ pathname: '/success', params: { type: 'payment' } })} >
          <Feather name="check-circle" size={20} color={selectedProvider ? Colors.white : Colors.gray[400]} />
          <Text style={[styles.confirmText, !selectedProvider && { color: Colors.gray[400] }]}>
            Confirmer le paiement
          </Text>
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
    backgroundColor: withOpacity(Colors.success, 0.12),
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
  payHero: {
    marginHorizontal: Theme.spacing.page,
    backgroundColor: withOpacity(Colors.success, 0.1),
    borderRadius: Theme.radius.xl,
    padding: Theme.spacing.xl,
    marginBottom: Theme.spacing.xl,
    borderWidth: 1,
    borderColor: withOpacity(Colors.success, 0.22),
    ...Theme.shadow.soft,
  },
  payTag: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 11,
    color: Colors.gray[600],
    letterSpacing: 0.8,
    marginBottom: Theme.spacing.md,
    textTransform: 'uppercase',
  },
  payTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Theme.spacing.md },
  payLabel: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 13,
    color: Colors.gray[600],
    marginBottom: 4,
    letterSpacing: 0.15,
  },
  payMotif: { fontFamily: Fonts.outfit.medium, fontSize: 15, color: Colors.gray[900], lineHeight: 21 },
  payMotifIcon: {
    width: 48,
    height: 48,
    borderRadius: Theme.radius.sm,
    backgroundColor: withOpacity(Colors.success, 0.15),
    alignItems: 'center',
    justifyContent: 'center',
  },
  payDivider: { height: 1, backgroundColor: withOpacity(Colors.success, 0.25), marginBottom: Theme.spacing.md },
  payAmountLabel: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 13,
    color: Colors.gray[600],
    marginBottom: 6,
    letterSpacing: 0.15,
  },
  payAmount: {
    fontFamily: Fonts.spaceGrotesk.bold,
    fontSize: 34,
    color: Colors.success,
    letterSpacing: -0.5,
  },
  payAmountCurrency: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 17,
    color: Colors.success,
    letterSpacing: 1.2,
    opacity: 0.92,
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
  providerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: Theme.spacing.md,
    paddingHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.xl,
  },
  providerCell: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Theme.screen.surface,
    borderRadius: Theme.radius.lg,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    paddingVertical: 10,
    paddingRight: Theme.spacing.sm,
    paddingLeft: 0,
    overflow: 'hidden',
    minHeight: 72,
    gap: 6,
    ...Theme.shadow.soft,
  },
  providerCellSelected: {
    backgroundColor: withOpacity(Colors.brand, 0.07),
    borderColor: withOpacity(Colors.brand, 0.35),
  },
  providerBrandStripe: {
    width: 4,
    alignSelf: 'stretch',
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
    minHeight: 40,
  },
  providerCellLogo: {
    width: 72,
    height: 44,
    backgroundColor: Colors.gray[50],
    borderRadius: Theme.radius.sm,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  providerCellText: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  providerCellTitle: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 12,
    lineHeight: 16,
    color: Colors.gray[900],
    marginBottom: 3,
    letterSpacing: -0.15,
  },
  providerCellSubtitle: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 10,
    lineHeight: 13,
    color: Colors.gray[500],
    letterSpacing: 0.2,
    opacity: 0.9,
  },
  radioOuter: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: Colors.gray[300],
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOuterOn: {
    borderColor: Colors.brand,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.brand,
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
  recapCard: {
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Theme.screen.surface,
    borderRadius: Theme.radius.lg,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.lg,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    ...Theme.shadow.soft,
  },
  recapEyebrow: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 11,
    color: Colors.gray[600],
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    marginBottom: Theme.spacing.md,
  },
  recapRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 12,
    marginBottom: 12,
  },
  recapLabel: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.gray[600],
    flex: 1,
    flexShrink: 1,
  },
  recapValueNum: {
    fontFamily: Fonts.spaceGrotesk.bold,
    fontSize: 15,
    color: Colors.gray[900],
    letterSpacing: -0.2,
    textAlign: 'right',
  },
  recapValueCurrency: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 12,
    color: Colors.gray[700],
    letterSpacing: 0.35,
    opacity: 0.95,
  },
  recapDivider: { height: 1, backgroundColor: Colors.gray[100], marginVertical: 4 },
  recapTotal: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 15,
    color: Colors.gray[900],
    flex: 1,
  },
  recapTotalValue: {
    fontFamily: Fonts.spaceGrotesk.bold,
    fontSize: 20,
    color: Colors.success,
    letterSpacing: -0.35,
    textAlign: 'right',
  },
  recapTotalCurrency: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 13,
    color: Colors.success,
    letterSpacing: 0.45,
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
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Colors.brand,
    paddingVertical: 18,
    borderRadius: Theme.radius.md,
    ...Theme.shadow.soft,
  },
  confirmDisabled: { backgroundColor: Colors.gray[200], shadowOpacity: 0, elevation: 0 },
  confirmText: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 17,
    letterSpacing: 0.2,
    color: Colors.white,
  },
});
