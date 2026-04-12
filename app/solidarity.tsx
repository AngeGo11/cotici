import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/constants/Colors';
import { Fonts } from '@/constants/Fonts';
import { Theme } from '@/constants/Theme';
import type { AidHistory } from '@/types';

const aidHistory: AidHistory[] = [
  { id: '1', type: 'Aide Santé', recipient: 'Fatou K.', amount: 25000, date: '05 Fév 2026', icon: 'medical' },
  { id: '2', type: 'Aide Éducation', recipient: 'Amadou B.', amount: 30000, date: '28 Jan 2026', icon: 'education' },
  { id: '3', type: 'Urgence Famille', recipient: 'Marie K.', amount: 40000, date: '15 Jan 2026', icon: 'family' },
  { id: '4', type: 'Aide Médicale', recipient: 'Ibrahim S.', amount: 35000, date: '03 Jan 2026', icon: 'medical' },
];

const iconConfig: Record<AidHistory['icon'], { name: keyof typeof Feather.glyphMap; color: string; bg: string }> = {
  medical: { name: 'plus', color: Colors.danger, bg: withOpacity(Colors.danger, 0.08) },
  education: { name: 'book-open', color: Colors.info, bg: withOpacity(Colors.info, 0.1) },
  emergency: { name: 'alert-circle', color: Colors.brand, bg: withOpacity(Colors.brand, 0.1) },
  family: { name: 'heart', color: Colors.brand, bg: withOpacity(Colors.brand, 0.1) },
};

export default function SolidarityScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
          </TouchableOpacity>
          <TouchableOpacity><Text style={styles.ruleLink}>Règlement</Text></TouchableOpacity>
        </View>

        <View style={styles.titleRow}>
          <View style={styles.titleIcon}><Feather name="users" size={24} color={Colors.white} /></View>
          <View>
            <Text style={styles.title}>Tontine Solidaire</Text>
            <Text style={styles.subtitle}>des Commerçants</Text>
          </View>
        </View>

        <View style={styles.cardsRow}>
          <View style={styles.rotatingCard}>
            <View style={styles.cardIcon}><Feather name="refresh-cw" size={20} color={Colors.success} /></View>
            <Text style={styles.cardLabel}>Cagnotte Tournante</Text>
            <Text style={styles.cardAmount}>200.000<Text style={styles.cardUnit}> F</Text></Text>
            <Text style={styles.cardSub}>8 membres actifs</Text>
          </View>
          <View style={styles.emergencyCard}>
            <View style={styles.cardIconWhite}><Feather name="alert-circle" size={20} color={Colors.white} /></View>
            <Text style={styles.emergencyLabel}>Fonds d'Urgence</Text>
            <Text style={styles.emergencyAmount}>50.000<Text style={styles.cardUnit}> F</Text></Text>
            <Text style={styles.emergencySub}>Disponible</Text>
          </View>
        </View>

        <View style={styles.infoBanner}>
          <Text style={styles.infoIcon}>ℹ️</Text>
          <Text style={styles.infoText}>Le fonds d'urgence est réservé aux situations critiques validées par le groupe.</Text>
        </View>

        <TouchableOpacity style={styles.emergencyButton} onPress={() => router.push({ pathname: '/success', params: { type: 'aid-request' } })}>
          <Feather name="alert-circle" size={20} color={Colors.brand} />
          <Text style={styles.emergencyButtonText}>Demander une aide d'urgence</Text>
        </TouchableOpacity>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Historique des Aides</Text>
          <TouchableOpacity><Text style={styles.seeAll}>Voir tout</Text></TouchableOpacity>
        </View>

        {aidHistory.map((aid) => {
          const cfg = iconConfig[aid.icon];
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

        <Text style={styles.impactTitle}>Impact collectif</Text>
        <View style={styles.impactRow}>
          <View style={[styles.impactCard, { backgroundColor: withOpacity(Colors.success, 0.1), borderColor: withOpacity(Colors.success, 0.2) }]}>
            <Text style={[styles.impactValue, { color: Colors.success }]}>12</Text>
            <Text style={styles.impactLabel}>Aides accordées</Text>
          </View>
          <View style={[styles.impactCard, { backgroundColor: withOpacity(Colors.brand, 0.1), borderColor: withOpacity(Colors.brand, 0.2) }]}>
            <Text style={[styles.impactValue, { color: Colors.brand }]}>8</Text>
            <Text style={styles.impactLabel}>Membres</Text>
          </View>
          <View style={[styles.impactCard, { backgroundColor: withOpacity(Colors.info, 0.1), borderColor: withOpacity(Colors.info, 0.2) }]}>
            <Text style={[styles.impactValue, { color: Colors.info }]}>130K</Text>
            <Text style={styles.impactLabel}>Total versé</Text>
          </View>
        </View>

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.screen.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Theme.spacing.page, paddingVertical: 12 },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.gray[100], alignItems: 'center', justifyContent: 'center' },
  ruleLink: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.brand },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: Theme.spacing.page, marginBottom: 24 },
  titleIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 24, color: Colors.gray[900] },
  subtitle: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[500] },
  cardsRow: { flexDirection: 'row', gap: 16, paddingHorizontal: Theme.spacing.page, marginBottom: 24 },
  rotatingCard: { flex: 1, backgroundColor: Theme.screen.surface, borderRadius: 24, padding: 20, borderWidth: 2, borderColor: withOpacity(Colors.success, 0.2) },
  cardIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: withOpacity(Colors.success, 0.1), alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  cardLabel: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[600], marginBottom: 8 },
  cardAmount: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 24, color: Colors.success },
  cardUnit: { fontSize: 14 },
  cardSub: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500], marginTop: 4 },
  emergencyCard: { flex: 1, backgroundColor: Colors.brand, borderRadius: 24, padding: 20 },
  cardIconWhite: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  emergencyLabel: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: 'rgba(255,255,255,0.9)', marginBottom: 8 },
  emergencyAmount: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 24, color: Colors.white },
  emergencySub: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  infoBanner: { flexDirection: 'row', gap: 12, marginHorizontal: Theme.spacing.page, backgroundColor: withOpacity(Colors.info, 0.08), borderRadius: 16, padding: 16, marginBottom: 24, borderWidth: 1, borderColor: withOpacity(Colors.info, 0.15), alignItems: 'center' },
  infoIcon: { fontSize: 16 },
  infoText: { flex: 1, fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.info },
  emergencyButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginHorizontal: Theme.spacing.page, paddingVertical: 16, borderRadius: 16, borderWidth: 2, borderColor: Colors.brand, marginBottom: 24 },
  emergencyButtonText: { fontFamily: Fonts.outfit.medium, fontSize: 16, color: Colors.brand },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Theme.spacing.page, marginBottom: 12 },
  sectionTitle: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 20, color: Colors.gray[900] },
  seeAll: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.brand },
  aidItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: Theme.spacing.page, backgroundColor: Colors.gray[50], borderRadius: 16, padding: 16, marginBottom: 8 },
  aidLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  aidIcon: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  aidType: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.gray[900] },
  aidRecipient: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500] },
  aidAmount: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 14, color: Colors.brand },
  aidDate: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500] },
  impactTitle: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 18, color: Colors.gray[900], paddingHorizontal: Theme.spacing.page, marginTop: 24, marginBottom: 16 },
  impactRow: { flexDirection: 'row', gap: 12, paddingHorizontal: Theme.spacing.page },
  impactCard: { flex: 1, borderRadius: 16, padding: 16, alignItems: 'center', borderWidth: 1 },
  impactValue: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 24, marginBottom: 4 },
  impactLabel: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[600], textAlign: 'center' },
});
