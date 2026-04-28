import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { Fonts } from '@/constants/Fonts';
import { Theme } from '@/constants/Theme';
import { SOLIDARITY_AID_HISTORY, getSolidarityAidIconConfig } from '@/data/solidarityAidHistory';

export default function SolidarityAidHistoryScreen() {
  const router = useRouter();
  const total = SOLIDARITY_AID_HISTORY.reduce((s, a) => s + a.amount, 0);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.85}>
          <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Historique des aides</Text>
        <View style={styles.backButton} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.totalBanner}>
          <Text style={styles.totalLabel}>Total alloué (période affichée)</Text>
          <Text style={styles.totalValue}>{total.toLocaleString('fr-FR')} F</Text>
        </View>
        {SOLIDARITY_AID_HISTORY.map((aid) => {
          const cfg = getSolidarityAidIconConfig(aid.icon);
          return (
            <View key={aid.id} style={styles.aidItem}>
              <View style={styles.aidLeft}>
                <View style={[styles.aidIcon, { backgroundColor: cfg.bg }]}>
                  <Feather name={cfg.name} size={16} color={cfg.color} />
                </View>
                <View>
                  <Text style={styles.aidType}>{aid.type}</Text>
                  <Text style={styles.aidRecipient}>Pour {aid.recipient}</Text>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.aidAmount}>{aid.amount.toLocaleString('fr-FR')} F</Text>
                <Text style={styles.aidDate}>{aid.date}</Text>
              </View>
            </View>
          );
        })}
        <View style={{ height: 32 }} />
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
  headerTitle: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 17, color: Colors.gray[900] },
  scroll: { paddingHorizontal: Theme.spacing.page, paddingBottom: 32 },
  totalBanner: { backgroundColor: Theme.screen.surface, borderRadius: Theme.radius.lg, padding: Theme.spacing.lg, marginBottom: Theme.spacing.lg, borderWidth: 1, borderColor: Colors.gray[100] },
  totalLabel: { fontFamily: Fonts.outfit.regular, fontSize: 13, color: Colors.gray[500] },
  totalValue: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 24, color: Colors.brand, marginTop: 4 },
  aidItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.gray[50],
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
  },
  aidLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  aidIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  aidType: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.gray[900] },
  aidRecipient: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500] },
  aidAmount: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 14, color: Colors.brand },
  aidDate: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500] },
});
