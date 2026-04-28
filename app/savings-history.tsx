import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/constants/Colors';
import { Fonts } from '@/constants/Fonts';
import { Theme } from '@/constants/Theme';
import { SAVINGS_CONTRIBUTIONS } from '@/data/savingsContributions';

const total = SAVINGS_CONTRIBUTIONS.reduce((s, c) => s + c.amount, 0);

export default function SavingsHistoryScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.85}>
          <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Historique</Text>
        <View style={styles.backButton} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.summary}>
          <Text style={styles.summaryLabel}>Total versé sur cet objectif</Text>
          <Text style={styles.summaryValue}>{total.toLocaleString('fr-FR')} F</Text>
          <Text style={styles.summaryHint}>{SAVINGS_CONTRIBUTIONS.length} opérations enregistrées</Text>
        </View>
        <Text style={styles.sectionEyebrow}>Toutes les opérations</Text>
        {SAVINGS_CONTRIBUTIONS.map((c) => (
          <View key={c.id} style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={styles.contribIcon}>
                <Feather name="arrow-down-left" size={18} color={Colors.success} />
              </View>
              <View>
                <Text style={styles.type}>{c.label}</Text>
                <Text style={styles.date}>{c.date}</Text>
              </View>
            </View>
            <Text style={styles.amount}>+{c.amount.toLocaleString('fr-FR')} F</Text>
          </View>
        ))}
        <View style={{ height: 40 }} />
      </ScrollView>
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
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: Theme.screen.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 18, color: Colors.gray[900] },
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
  contribIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: withOpacity(Colors.success, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  type: { fontFamily: Fonts.outfit.medium, fontSize: 15, color: Colors.gray[900] },
  date: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500], marginTop: 2 },
  amount: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 16, color: Colors.success },
});
