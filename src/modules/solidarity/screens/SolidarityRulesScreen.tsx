import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';

const RULES = [
  { title: 'Adhésion', text: "Tout membre accepte de cotiser selon l'échéance fixée par le groupe et de participer aux votes d'attribution le cas échéant." },
  { title: "Fonds d'urgence", text: "Les demandes d'aide doivent être documentées (certificat médical, justificatif). Le groupe valide par majorité ou selon le quorum défini." },
  { title: 'Transparence', text: "Les versements et attributions sont tracés dans l'app. Tout litige interne se règle d'abord auprès des administrateurs du groupe." },
  { title: 'Exclusion', text: 'Trois retards de cotisation non justifiés peuvent entraîner une exclusion selon le règlement validé en début de cycle.' },
] as const;

export default function SolidarityRulesScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.85}>
          <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Règlement</Text>
        <View style={styles.backButton} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.banner}>
          <Feather name="heart" size={24} color={Colors.brand} />
          <Text style={styles.bannerTitle}>Tontine solidaire</Text>
          <Text style={styles.bannerSub}>Règles applicables à ce groupe (résumé)</Text>
        </View>
        {RULES.map((r, i) => (
          <View key={r.title} style={styles.ruleCard}>
            <View style={styles.ruleNum}>
              <Text style={styles.ruleNumText}>{i + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.ruleTitle}>{r.title}</Text>
              <Text style={styles.ruleBody}>{r.text}</Text>
            </View>
          </View>
        ))}
        <Text style={styles.footerNote}>
          Le règlement complet peut être fourni par l’administrateur du groupe. COTICI ne se substitue pas aux accords entre membres.
        </Text>
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
  headerTitle: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 18, color: Colors.gray[900] },
  scroll: { paddingHorizontal: Theme.spacing.page, paddingBottom: 32 },
  banner: {
    backgroundColor: withOpacity(Colors.brand, 0.08),
    borderRadius: Theme.radius.xl,
    padding: Theme.spacing.xl,
    marginBottom: Theme.spacing.lg,
    borderWidth: 1,
    borderColor: withOpacity(Colors.brand, 0.15),
    alignItems: 'center',
  },
  bannerTitle: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 20, color: Colors.gray[900], marginTop: 10 },
  bannerSub: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[600], marginTop: 4, textAlign: 'center' },
  ruleCard: { flexDirection: 'row', gap: 12, backgroundColor: Theme.screen.surface, borderRadius: Theme.radius.lg, padding: Theme.spacing.lg, marginBottom: Theme.spacing.md, borderWidth: 1, borderColor: Colors.gray[100] },
  ruleNum: { width: 32, height: 32, borderRadius: 16, backgroundColor: withOpacity(Colors.brand, 0.12), alignItems: 'center', justifyContent: 'center' },
  ruleNumText: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 16, color: Colors.brand },
  ruleTitle: { fontFamily: Fonts.outfit.medium, fontSize: 16, color: Colors.gray[900], marginBottom: 4 },
  ruleBody: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[600], lineHeight: 21 },
  footerNote: { fontFamily: Fonts.outfit.regular, fontSize: 13, color: Colors.gray[500], lineHeight: 20, marginTop: 8 },
});
