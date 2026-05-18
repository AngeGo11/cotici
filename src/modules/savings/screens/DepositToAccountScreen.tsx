import { useState } from 'react';
import { 
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
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

const CURRENT_BALANCE = 487_000;

const providers = [
  { id: 'orange' as const, name: 'Orange Money', bg: Colors.provider.orange, text: Colors.white },
  { id: 'mtn' as const, name: 'MTN MoMo', bg: Colors.provider.mtn, text: Colors.gray[900] },
  { id: 'wave' as const, name: 'Wave', bg: Colors.provider.wave, text: Colors.white },
  { id: 'moov' as const, name: 'Moov Money', bg: Colors.provider.moov, text: Colors.white },
];

const quickAmounts = [5000, 10000, 25000, 50000, 100000];

/** Montants entiers, espaces insécables (locale FR). */
function formatMoney(amount: number): string {
  return Math.round(amount).toLocaleString('fr-FR', { maximumFractionDigits: 0 });
}

const tabularAmount = { fontVariant: ['tabular-nums' as const] };

export default function DepositToAccountScreen() {
  const router = useRouter();
  const [selectedProvider, setSelectedProvider] = useState<PaymentProvider>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('+225 07 08 09 10 11');

  const amountNum = depositAmount ? Number(depositAmount.replace(/\s/g, '')) : 0;
  const previewNew =
    depositAmount && !Number.isNaN(amountNum) && amountNum > 0
      ? CURRENT_BALANCE + amountNum
      : null;

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
            {`${formatMoney(CURRENT_BALANCE)}\u202f`}
            <Text style={styles.balanceCurrency}>FCFA</Text>
          </Text>
          <Text style={styles.balanceHint}>
            <Text style={[styles.balanceHintEm, tabularAmount]}>+{formatMoney(25_000)} FCFA</Text>
            {' · '}
            entrées ce mois
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
              <Text style={styles.previewLabel}>Nouveau solde estimé</Text>
              <Text style={[styles.previewValue, tabularAmount]}>
                {formatMoney(previewNew)}
                <Text style={styles.previewCurrency}> FCFA</Text>
              </Text>
            </View>
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
          style={[styles.confirmButton, (!selectedProvider || !depositAmount) && styles.confirmDisabled]}
          disabled={!selectedProvider || !depositAmount}
          onPress={() => router.push({ pathname: '/success', params: { type: 'deposit' } })} >
          <Text style={[styles.confirmText, (!selectedProvider || !depositAmount) && { color: Colors.gray[400] }]}>
            Confirmer le dépôt
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
  /** Grille 2×2 : même structure (bandeau, logo, texte, radio) */
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
  confirmText: { fontFamily: Fonts.outfit.semiBold, fontSize: 17, letterSpacing: 0.2, color: Colors.white },
});
