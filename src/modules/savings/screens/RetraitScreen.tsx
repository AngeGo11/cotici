import { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';
import { PaymentProviderMark } from '@/components/PaymentProviderMark';
import type { PaymentProvider } from '@/types';

const BALANCE_FCFA = 487_000;

const providers = [
  { id: 'orange' as const, name: 'Orange Money', bg: Colors.provider.orange },
  { id: 'mtn' as const, name: 'MTN MoMo', bg: Colors.provider.mtn },
  { id: 'wave' as const, name: 'Wave', bg: Colors.provider.wave },
  { id: 'moov' as const, name: 'Moov Money', bg: Colors.provider.moov },
];

const quickAmounts = [5000, 10000, 25000, 50000, 100000];

/** Montants entiers, espaces insécables (locale FR). */
function formatMoney(amount: number): string {
  return Math.round(amount).toLocaleString('fr-FR', { maximumFractionDigits: 0 });
}

const tabularAmount = { fontVariant: ['tabular-nums' as const] };

export default function RetraitScreen() {
  const router = useRouter();
  const [selectedProvider, setSelectedProvider] = useState<PaymentProvider>(null);
  const [amountRaw, setAmountRaw] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('+225 07 08 09 10 11');

  const amountNum = useMemo(() => {
    const n = Number(amountRaw.replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? Math.floor(n) : NaN;
  }, [amountRaw]);

  const exceedsBalance = amountRaw !== '' && (!Number.isFinite(amountNum) || amountNum > BALANCE_FCFA);
  const belowMinimum =
    amountRaw !== '' && Number.isFinite(amountNum) && amountNum > 0 && amountNum < 100;
  const canSubmit =
    selectedProvider &&
    Number.isFinite(amountNum) &&
    amountNum >= 100 &&
    amountNum <= BALANCE_FCFA;

  const newBalance = canSubmit ? BALANCE_FCFA - amountNum : null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
          </TouchableOpacity>
        </View>

        <View style={styles.titleBlock}>
          <View style={styles.titleRow}>
            <View style={styles.titleIcon}>
              <Feather name="arrow-up-right" size={24} color={Colors.success} />
            </View>
            <View style={styles.titleTextWrap}>
              <Text style={styles.title}>Retrait</Text>
              <Text style={styles.subtitle}>
                Envoyez des fonds vers votre compte Mobile Money
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.balanceHero}>
          <Text style={styles.balanceTag}>Compte principal</Text>
          <Text style={styles.balanceLabel}>Solde disponible</Text>
          <Text style={[styles.balanceValue, tabularAmount]}>
            {`${formatMoney(BALANCE_FCFA)}\u202f`}
            <Text style={styles.balanceCurrency}>FCFA</Text>
          </Text>
          <Text style={styles.balanceHint}>
            Retrait minimum{' '}
            <Text style={[styles.balanceHintEm, tabularAmount]}>{formatMoney(100)} FCFA</Text>
          </Text>
        </View>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionEyebrow}>Montant</Text>
        </View>
        <View style={styles.surfaceCard}>
          <Text style={styles.inCardLabel}>Combien voulez-vous retirer ?</Text>
          <View style={[styles.amountInputRow, exceedsBalance && styles.amountInputRowError]}>
            <TextInput
              style={[styles.amountInput, tabularAmount]}
              value={amountRaw}
              onChangeText={setAmountRaw}
              placeholder="0"
              placeholderTextColor={Colors.gray[400]}
              keyboardType="number-pad"
            />
            <Text style={styles.unit}>FCFA</Text>
          </View>
          {exceedsBalance ? (
            <Text style={styles.errorText}>Montant supérieur à votre solde</Text>
          ) : null}
          {belowMinimum ? (
            <Text style={styles.errorText}>Montant minimum : 100 FCFA</Text>
          ) : null}

          <Text style={styles.quickLabel}>Montants rapides</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickRow}
          >
            {quickAmounts.map((a) => {
              const disabled = a > BALANCE_FCFA;
              const selected = amountRaw === a.toString();
              return (
                <TouchableOpacity
                  key={a}
                  style={[
                    styles.quickChip,
                    disabled && styles.quickChipDisabled,
                    selected && !disabled && styles.quickChipSelected,
                  ]}
                  disabled={disabled}
                  onPress={() => setAmountRaw(a.toString())}
                >
                  <Text
                    style={[
                      styles.quickChipText,
                      disabled && styles.quickChipTextDisabled,
                      selected && !disabled && styles.quickChipTextSelected,
                      tabularAmount,
                    ]}
                  >
                    {formatMoney(a)} F
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionEyebrow}>Opérateur Mobile Money</Text>
          <Text style={styles.sectionHint}>
            {"Vers quel portefeuille envoyer l'argent ?"}
          </Text>
        </View>
        <View style={styles.providerGrid}>
          {providers.map((p) => {
            const selected = selectedProvider === p.id;
            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.providerCell, selected && styles.providerCellSelected]}
                onPress={() => setSelectedProvider(p.id)}
                activeOpacity={0.88}
                accessibilityRole="radio"
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
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.sectionHead}>
          <Text style={styles.sectionEyebrow}>Numéro du compte</Text>
        </View>
        <View style={styles.surfaceCard}>
          <Text style={styles.inCardLabel}>Téléphone qui recevra le transfert</Text>
          <TextInput
            style={[styles.inputBare, tabularAmount]}
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            keyboardType="phone-pad"
            placeholder="+225 …"
            placeholderTextColor={Colors.gray[400]}
          />
        </View>

        {newBalance !== null ? (
          <View style={styles.previewCard}>
            <Text style={styles.previewEyebrow}>Après ce retrait</Text>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>Solde estimé</Text>
              <Text style={[styles.previewValue, tabularAmount]}>
                {formatMoney(newBalance)}
                <Text style={styles.previewCurrency}> FCFA</Text>
              </Text>
            </View>
            <Text style={styles.feeNote}>
              Frais :{' '}
              <Text style={[styles.feeNoteEm, tabularAmount]}>{formatMoney(0)} FCFA</Text>
              {' '}(offre promotionnelle)
            </Text>
          </View>
        ) : null}

        <View style={styles.securityPill}>
          <Feather name="shield" size={16} color={Colors.success} />
          <Text style={styles.securityText}>
            Transfert sécurisé{' '}
            <Text style={styles.securityEm}>·</Text>
            {' '}données chiffrées
          </Text>
        </View>

        <TouchableOpacity
          style={[styles.confirmButton, !canSubmit && styles.confirmDisabled]}
          disabled={!canSubmit}
          onPress={() => router.push({ pathname: '/success', params: { type: 'withdrawal' } })}
          activeOpacity={0.9}
        >
          <Text style={[styles.confirmText, !canSubmit && { color: Colors.gray[400] }]}>
            Confirmer le retrait
          </Text>
        </TouchableOpacity>
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
    marginBottom: Theme.spacing.sm,
  },
  amountInputRowError: {
    borderColor: withOpacity(Colors.danger, 0.55),
    backgroundColor: withOpacity(Colors.danger, 0.05),
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
  errorText: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 13,
    color: Colors.danger,
    marginBottom: Theme.spacing.md,
  },
  quickLabel: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 11,
    color: Colors.gray[500],
    marginBottom: Theme.spacing.sm,
    marginTop: Theme.spacing.sm,
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
  quickChipDisabled: { opacity: 0.38 },
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
  quickChipTextDisabled: { color: Colors.gray[400] },
  quickChipTextSelected: { color: Colors.brand },
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
  feeNote: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 12,
    lineHeight: 17,
    color: Colors.gray[500],
    marginTop: Theme.spacing.md,
  },
  feeNoteEm: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 12,
    color: Colors.gray[700],
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
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Colors.brand,
    paddingVertical: 18,
    borderRadius: Theme.radius.md,
    alignItems: 'center',
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
