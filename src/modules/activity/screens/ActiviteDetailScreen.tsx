import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';
import { getActivityById } from '@/data/recentActivities';

export default function ActiviteDetailScreen() {
  const router = useRouter();
  const { id: idParam } = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(idParam) ? idParam[0] : idParam;
  const activity = id ? getActivityById(id) : undefined;

  if (!activity) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
          </TouchableOpacity>
        </View>
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Activité introuvable</Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Text style={styles.emptyLink}>Retour</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const isCredit = activity.amount > 0;
  const statusColor =
    activity.status === 'Complété'
      ? Colors.success
      : activity.status === 'En cours'
        ? Colors.brand
        : Colors.danger;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
          </TouchableOpacity>
        </View>

        <View style={styles.hero}>
          <View
            style={[
              styles.heroIcon,
              {
                backgroundColor: isCredit
                  ? withOpacity(Colors.success, 0.12)
                  : withOpacity(Colors.danger, 0.08),
              },
            ]}
          >
            <Feather
              name={isCredit ? 'arrow-down-left' : 'arrow-up-right'}
              size={32}
              color={isCredit ? Colors.success : Colors.danger}
            />
          </View>
          <Text style={styles.typeLabel}>{activity.type}</Text>
          <Text
            style={[styles.amount, { color: isCredit ? Colors.success : Colors.danger }]}
          >
            {isCredit ? '+' : ''}
            {activity.amount.toLocaleString('fr-FR')} <Text style={styles.currency}>FCFA</Text>
          </Text>
          <View style={[styles.statusPill, { backgroundColor: withOpacity(statusColor, 0.12) }]}>
            <Text style={[styles.statusText, { color: statusColor }]}>{activity.status}</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Row label="Date" value={`${activity.date} · ${activity.time}`} />
          <Row label="Référence" value={activity.reference} mono />
          <Row label="Moyen" value={activity.method} />
          {activity.accountHint ? <Row label="Compte / contexte" value={activity.accountHint} /> : null}
        </View>

        {activity.note ? (
          <View style={styles.noteCard}>
            <Feather name="info" size={18} color={Colors.gray[500]} />
            <Text style={styles.noteText}>{activity.note}</Text>
          </View>
        ) : null}

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={[styles.rowValue, mono && styles.rowValueMono]}>{value}</Text>
    </View>
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
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  emptyTitle: { fontFamily: Fonts.outfit.regular, fontSize: 16, color: Colors.gray[600], marginBottom: 12 },
  emptyLink: { fontFamily: Fonts.outfit.medium, fontSize: 16, color: Colors.brand },
  hero: { alignItems: 'center', paddingHorizontal: Theme.spacing.page, paddingBottom: 24 },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
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
  amount: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 36, marginBottom: 16 },
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
  noteText: { flex: 1, fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[700], lineHeight: 20 },
});
