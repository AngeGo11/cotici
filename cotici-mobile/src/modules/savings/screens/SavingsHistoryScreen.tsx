import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { AnimatedPressable } from '@/shared/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';
import { useSavingsTransactions } from '@/modules/savings/hooks/useWalletActivities';

export default function SavingsHistoryScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { transactions, loading, error } = useSavingsTransactions(id);

  const total = transactions.reduce((sum, tx) => sum + tx.amount, 0);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <AnimatedPressable style={styles.backButton} onPress={() => router.back()}>
          <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>Historique</Text>
        <View style={styles.backButton} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.brand} />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <View style={styles.summary}>
            <Text style={styles.summaryLabel}>Total versé sur cet objectif</Text>
            <Text style={styles.summaryValue}>{total.toLocaleString('fr-FR')} F</Text>
            <Text style={styles.summaryHint}>
              {transactions.length}{' '}
              {transactions.length <= 1 ? 'opération enregistrée' : 'opérations enregistrées'}
            </Text>
          </View>

          <Text style={styles.sectionEyebrow}>Toutes les opérations</Text>

          {transactions.length === 0 ? (
            <Text style={styles.emptyText}>Aucune opération pour le moment.</Text>
          ) : (
            transactions.map((tx) => {
              const isWithdraw = tx.amount < 0;
              const displayAmount = Math.abs(tx.amount);
              return (
              <AnimatedPressable
                key={tx.reference}
                style={styles.row}
                onPress={() =>
                  router.push({
                    pathname: '/savings-transaction/[ref]',
                    params: { ref: tx.reference, goalId: id ?? '' },
                  })
                }
              >
                <View style={styles.rowLeft}>
                  <View
                    style={[
                      styles.contribIcon,
                      isWithdraw && styles.contribIconWithdraw,
                    ]}
                  >
                    <Feather
                      name={isWithdraw ? 'arrow-up-right' : 'arrow-down-left'}
                      size={18}
                      color={isWithdraw ? Colors.brand : Colors.success}
                    />
                  </View>
                  <View style={styles.rowTexts}>
                    <Text style={styles.type}>{tx.type}</Text>
                    <Text style={styles.date}>
                      {tx.date} · {tx.time}
                    </Text>
                  </View>
                </View>
                <View style={styles.rowRight}>
                  <Text
                    style={[styles.amount, isWithdraw && styles.amountWithdraw]}
                  >
                    {isWithdraw ? '−' : '+'}
                    {displayAmount.toLocaleString('fr-FR')} F
                  </Text>
                  <Feather name="chevron-right" size={16} color={Colors.gray[400]} />
                </View>
              </AnimatedPressable>
            );
            })
          )}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.screen.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  },
  headerTitle: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 18, color: Colors.gray[900] },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Theme.spacing.page },
  errorText: { fontFamily: Fonts.outfit.medium, fontSize: 15, color: Colors.danger, textAlign: 'center' },
  scroll: { paddingBottom: 32 },
  summary: {
    marginHorizontal: Theme.spacing.page,
    backgroundColor: withOpacity(Colors.success, 0.1),
    borderRadius: Theme.radius.xl,
    padding: Theme.spacing.xl,
    marginBottom: Theme.spacing.lg,
    borderWidth: 1,
    borderColor: withOpacity(Colors.success, 0.2),
  },
  summaryLabel: { fontFamily: Fonts.outfit.regular, fontSize: 13, color: Colors.gray[600], marginBottom: 4 },
  summaryValue: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 28, color: Colors.success },
  summaryHint: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500], marginTop: 6 },
  sectionEyebrow: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 13,
    color: Colors.gray[500],
    paddingHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.md,
  },
  emptyText: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    color: Colors.gray[500],
    textAlign: 'center',
    paddingHorizontal: Theme.spacing.page,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Theme.screen.surface,
    borderRadius: Theme.radius.md,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.sm,
    borderWidth: 1,
    borderColor: Colors.gray[100],
  },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  rowTexts: { flex: 1 },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  contribIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: withOpacity(Colors.success, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  contribIconWithdraw: {
    backgroundColor: withOpacity(Colors.brand, 0.1),
  },
  type: { fontFamily: Fonts.outfit.medium, fontSize: 15, color: Colors.gray[900] },
  date: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500], marginTop: 2 },
  amount: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 16, color: Colors.success },
  amountWithdraw: { color: Colors.brand },
});
