import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/constants/Colors';
import { Fonts } from '@/constants/Fonts';
import { Theme } from '@/constants/Theme';
import { UPCOMING_DEADLINES, type UpcomingDeadline } from '@/data/upcomingDeadlines';

function kindIcon(kind: UpcomingDeadline['kind']) {
  switch (kind) {
    case 'epargne':
      return 'target' as const;
    case 'solidaire':
      return 'heart' as const;
    default:
      return 'users' as const;
  }
}

export default function ProchainesEcheancesScreen() {
  const router = useRouter();
  const list = UPCOMING_DEADLINES;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.85}>
          <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Prochaines échéances</Text>
        <View style={{ width: 40 }} />
      </View>
      <Text style={styles.subtitle}>
        Cotisations et versements à prévoir sur les prochains jours
      </Text>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {list.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="calendar" size={40} color={Colors.gray[300]} />
            <Text style={styles.emptyTitle}>Aucune échéance</Text>
            <Text style={styles.emptySub}>Vous serez notifié lorsqu&apos;une date approchera.</Text>
          </View>
        ) : (
          list.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.row}
              onPress={() => router.push('/make-deposit')}
              activeOpacity={0.75}
            >
              <View style={styles.iconWrap}>
                <Feather name={kindIcon(item.kind)} size={22} color={Colors.brand} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.title}</Text>
                <Text style={styles.rowMeta}>
                  {item.amountF.toLocaleString('fr-FR')} F · {item.dueRelative}
                </Text>
              </View>
              <Feather name="chevron-right" size={20} color={Colors.gray[400]} />
            </TouchableOpacity>
          ))
        )}
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
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Theme.screen.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...Theme.shadow.soft,
  },
  headerTitle: {
    fontFamily: Fonts.spaceGrotesk.bold,
    fontSize: 18,
    color: Colors.gray[900],
  },
  subtitle: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    color: Colors.gray[600],
    paddingHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.lg,
    lineHeight: 20,
  },
  scroll: { paddingBottom: 100 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.md,
    marginHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.sm,
    padding: Theme.spacing.lg,
    backgroundColor: Theme.screen.surface,
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    ...Theme.shadow.soft,
  },
  iconWrap: {
    width: 48,
    height: 48,
    borderRadius: Theme.radius.sm,
    backgroundColor: withOpacity(Colors.brand, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 15,
    color: Colors.gray[900],
    marginBottom: 4,
  },
  rowMeta: { fontFamily: Fonts.outfit.regular, fontSize: 13, color: Colors.brand },
  empty: {
    marginHorizontal: Theme.spacing.page,
    marginTop: Theme.spacing.xl,
    padding: Theme.spacing.xl,
    alignItems: 'center',
    backgroundColor: Theme.screen.surface,
    borderRadius: Theme.radius.lg,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    ...Theme.shadow.soft,
  },
  emptyTitle: {
    fontFamily: Fonts.spaceGrotesk.bold,
    fontSize: 18,
    color: Colors.gray[900],
    marginTop: Theme.spacing.md,
    marginBottom: 8,
  },
  emptySub: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    color: Colors.gray[500],
    textAlign: 'center',
    lineHeight: 20,
  },
});
