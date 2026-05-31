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

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, mono && styles.rowValueMono]}>{value}</Text>
    </View>
  );
}

export default function SavingsTransactionDetailScreen() {
  const router = useRouter();
  const { ref: refParam, goalId: goalIdParam } = useLocalSearchParams<{
    ref?: string | string[];
    goalId?: string | string[];
  }>();
  const ref = Array.isArray(refParam) ? refParam[0] : refParam;
  const goalId = Array.isArray(goalIdParam) ? goalIdParam[0] : goalIdParam;
  const { getByRef, loading, error } = useSavingsTransactions(goalId);
  const transaction = ref ? getByRef(ref) : undefined;

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <AnimatedPressable style={styles.backButton} onPress={() => router.back()}>
            <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
          </AnimatedPressable>
        </View>
        <View style={styles.centered}>
          <ActivityIndicator color={Colors.brand} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !transaction) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <AnimatedPressable style={styles.backButton} onPress={() => router.back()}>
            <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
          </AnimatedPressable>
        </View>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error ?? 'Opération introuvable.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const statusColor =
    transaction.status === 'Complété'
      ? Colors.success
      : transaction.status === 'En cours'
        ? Colors.brand
        : Colors.danger;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <AnimatedPressable style={styles.backButton} onPress={() => router.back()}>
            <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
          </AnimatedPressable>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Feather name="arrow-down-left" size={32} color={Colors.success} />
          </View>
          <Text style={styles.typeLabel}>{transaction.type}</Text>
          <Text style={styles.amount}>
            +{transaction.amount.toLocaleString('fr-FR')}{' '}
            <Text style={styles.currency}>FCFA</Text>
          </Text>
          <View style={[styles.statusPill, { backgroundColor: withOpacity(statusColor, 0.12) }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{transaction.status}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Row label="Date" value={`${transaction.date} · ${transaction.time}`} />
          <Row label="Référence" value={transaction.reference} mono />
          <Row label="Moyen" value={transaction.method} />
          {transaction.accountHint ? (
            <Row label="Numéro de téléphone" value={transaction.accountHint} />
          ) : null}
        </View>

        {transaction.note ? (
          <View style={styles.noteCard}>
            <Feather name="info" size={18} color={Colors.gray[500]} />
            <Text style={styles.noteText}>{transaction.note}</Text>
          </View>
        ) : null}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.screen.bg },
  header: { paddingHorizontal: Theme.spacing.page, paddingVertical: 8 },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  errorText: { fontFamily: Fonts.outfit.medium, fontSize: 15, color: Colors.danger, textAlign: 'center' },
  hero: { alignItems: 'center', paddingHorizontal: Theme.spacing.page, paddingBottom: 24 },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: withOpacity(Colors.success, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  typeLabel: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 15,
    color: Colors.gray[600],
    marginBottom: 8,
    textAlign: 'center',
  },
  amount: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 36, color: Colors.success, marginBottom: 16 },
  currency: { fontSize: 20 },
  statusPill: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  statusText: { fontFamily: Fonts.outfit.medium, fontSize: 13 },
  card: {
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Colors.gray[50],
    borderRadius: 20,
    padding: 20,
    gap: 16,
    borderWidth: 1,
    borderColor: Colors.gray[100],
  },
  row: { gap: 6 },
  rowLabel: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500] },
  rowValue: { fontFamily: Fonts.outfit.medium, fontSize: 16, color: Colors.gray[900] },
  rowValueMono: { fontFamily: Fonts.spaceGrotesk.medium, fontSize: 14 },
  noteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginHorizontal: Theme.spacing.page,
    marginTop: 16,
    padding: 16,
    borderRadius: 16,
    backgroundColor: withOpacity(Colors.info, 0.08),
    borderWidth: 1,
    borderColor: withOpacity(Colors.info, 0.15),
  },
  noteText: {
    flex: 1,
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    color: Colors.gray[700],
    lineHeight: 20,
  },
});
