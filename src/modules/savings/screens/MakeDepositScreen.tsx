import { useMemo } from 'react';
import {
  View,
  Text,
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
import { parseBalance } from '@/shared/api';
import { formatMonthlyFlow, useAuth } from '@/shared/auth';

const FEE_F = 0;
const DEFAULT_PAY_AMOUNT_F = 10_000;

/** Montants entiers, espaces insécables (locale FR). */
function formatMoney(amount: number): string {
  return Math.round(amount).toLocaleString('fr-FR', { maximumFractionDigits: 0 });
}

const tabularAmount = { fontVariant: ['tabular-nums' as const] };

export default function MakeDepositScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const currentBalance = parseBalance(user?.solde_courant);
  const params = useLocalSearchParams<{
    tontineId?: string;
    tontineName?: string;
    turn?: string;
    amount?: string;
  }>();

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
  const canPay = currentBalance >= total;
  const shortfall = total - currentBalance;
  const balanceAfter = currentBalance - total;

  const confirmParams = useMemo(
    () => ({
      pathname: '/success' as const,
      params: {
        type: 'payment',
        ...(typeof params.tontineId === 'string' && params.tontineId
          ? { tontineId: params.tontineId }
          : {}),
      },
    }),
    [params.tontineId],
  );

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
              <Feather name="users" size={24} color={Colors.success} />
            </View>
            <View style={styles.titleTextWrap}>
              <Text style={styles.title}>Payer ma cotisation</Text>
              <Text style={styles.subtitle}>
                Débit depuis votre solde Cotici
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.balanceHero}>
          <Text style={styles.balanceTag}>Compte principal</Text>
          <Text style={styles.balanceLabel}>Solde disponible</Text>
          <Text style={[styles.balanceValue, tabularAmount]}>
            {`${formatMoney(currentBalance)}\u202f`}
            <Text style={styles.balanceCurrency}>FCFA</Text>
          </Text>
          <Text style={styles.balanceHint}>
            Entrées{' '}
            <Text style={styles.balanceHintEm}>
              {formatMonthlyFlow(user?.entrees_ce_mois, 'in')}
            </Text>
            {' · '}Sorties{' '}
            <Text style={styles.balanceHintEm}>
              {formatMonthlyFlow(user?.sorties_ce_mois, 'out')}
            </Text>
          </Text>
        </View>

        <View style={styles.payHero}>
          <Text style={styles.payTag}>Cotisation à régler</Text>
          <View style={styles.payTopRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.payLabel}>Motif</Text>
              <Text style={styles.payMotif}>{payMotif}</Text>
            </View>
            <View style={styles.payMotifIcon}>
              <Feather name="refresh-cw" size={22} color={Colors.success} />
            </View>
          </View>
          <View style={styles.payDivider} />
          <Text style={styles.payAmountLabel}>Montant</Text>
          <Text style={[styles.payAmount, tabularAmount]}>
            {`${formatMoney(payAmount)}\u202f`}
            <Text style={styles.payAmountCurrency}>FCFA</Text>
          </Text>
        </View>

        <View style={styles.recapCard}>
          <Text style={styles.recapEyebrow}>Récapitulatif</Text>
          <View style={styles.recapRow}>
            <Text style={styles.recapLabel}>Solde avant paiement</Text>
            <Text style={[styles.recapValueNum, tabularAmount]}>
              {formatMoney(currentBalance)}
              <Text style={styles.recapValueCurrency}> FCFA</Text>
            </Text>
          </View>
          <View style={styles.recapRow}>
            <Text style={styles.recapLabel}>Cotisation</Text>
            <Text style={[styles.recapValueNum, styles.recapDebit, tabularAmount]}>
              −{formatMoney(payAmount)}
              <Text style={styles.recapValueCurrency}> FCFA</Text>
            </Text>
          </View>
          {FEE_F > 0 ? (
            <View style={styles.recapRow}>
              <Text style={styles.recapLabel}>Frais</Text>
              <Text style={[styles.recapValueNum, tabularAmount]}>
                {formatMoney(FEE_F)}
                <Text style={styles.recapValueCurrency}> FCFA</Text>
              </Text>
            </View>
          ) : null}
          <View style={styles.recapDivider} />
          <View style={styles.recapRow}>
            <Text style={styles.recapTotal}>Solde après paiement</Text>
            <Text
              style={[
                styles.recapTotalValue,
                !canPay && styles.recapTotalValueError,
                tabularAmount,
              ]}
            >
              {canPay ? formatMoney(balanceAfter) : '—'}
              <Text style={styles.recapTotalCurrency}> FCFA</Text>
            </Text>
          </View>
        </View>

        {!canPay ? (
          <View style={styles.shortfallCard}>
            <Feather name="alert-circle" size={20} color={Colors.accent} />
            <View style={styles.shortfallTextWrap}>
              <Text style={styles.shortfallTitle}>Solde insuffisant</Text>
              <Text style={styles.shortfallBody}>
                Il vous manque{' '}
                <Text style={[styles.shortfallEm, tabularAmount]}>
                  {formatMoney(shortfall)} FCFA
                </Text>
                {' '}pour payer cette cotisation.
              </Text>
            </View>
          </View>
        ) : null}

        <View style={styles.securityPill}>
          <Feather name="shield" size={16} color={Colors.success} />
          <Text style={styles.securityText}>
            Paiement sécurisé{' '}
            <Text style={styles.securityEm}>·</Text>
            {' '}débit immédiat sur votre solde
          </Text>
        </View>

        {!canPay ? (
          <AnimatedPressable
            style={styles.rechargeButton}
            onPress={() => router.push('/deposit-to-account')}
          >
            <Feather name="plus-circle" size={20} color={Colors.white} />
            <Text style={styles.rechargeButtonText}>Recharger mon compte</Text>
          </AnimatedPressable>
        ) : null}

        <AnimatedPressable
          style={[styles.confirmButton, !canPay && styles.confirmDisabled]}
          disabled={!canPay}
          onPress={() => router.push(confirmParams)}
        >
          <Feather name="check-circle" size={20} color={canPay ? Colors.white : Colors.gray[400]} />
          <Text style={[styles.confirmText, !canPay && styles.confirmTextDisabled]}>
            Confirmer la cotisation
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
  payTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: Theme.spacing.md,
  },
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
  recapDebit: { color: Colors.gray[700] },
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
  recapTotalValueError: { color: Colors.gray[400] },
  recapTotalCurrency: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 13,
    color: Colors.success,
    letterSpacing: 0.45,
    opacity: 0.92,
  },
  shortfallCard: {
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
  shortfallTextWrap: { flex: 1 },
  shortfallTitle: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 15,
    color: Colors.gray[900],
    marginBottom: 4,
  },
  shortfallBody: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    lineHeight: 20,
    color: Colors.gray[600],
  },
  shortfallEm: {
    fontFamily: Fonts.outfit.semiBold,
    color: Colors.gray[900],
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
    marginBottom: Theme.spacing.lg,
  },
  securityText: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 12,
    lineHeight: 16,
    color: Colors.gray[600],
    textAlign: 'center',
  },
  securityEm: { color: Colors.gray[400], paddingHorizontal: 2 },
  rechargeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.md,
    backgroundColor: Colors.brand,
    paddingVertical: 18,
    borderRadius: Theme.radius.md,
    ...Theme.shadow.soft,
  },
  rechargeButtonText: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 17,
    letterSpacing: 0.2,
    color: Colors.white,
  },
  confirmButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Colors.success,
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
  confirmTextDisabled: { color: Colors.gray[400] },
});
