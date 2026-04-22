import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/constants/Colors';
import { Fonts } from '@/constants/Fonts';
import { Theme } from '@/constants/Theme';
import type { JoinRequest, PaymentValidation } from '@/types';

const joinRequests: JoinRequest[] = [
  { id: '1', name: 'Sophie Traoré', avatar: 'ST', phone: '+225 07 12 34 56', requestDate: '10 Fév 2026' },
  { id: '2', name: 'Moussa Keita', avatar: 'MK', phone: '+225 05 98 76 54', requestDate: '09 Fév 2026' },
];

const paymentValidations: PaymentValidation[] = [
  { id: '1', memberName: 'Kouassi Jean', amount: 10000, method: 'Cash', date: '10 Fév 2026' },
  { id: '2', memberName: 'Awa Diallo', amount: 15000, method: 'Espèces', date: '09 Fév 2026' },
];

const penalties = [
  { id: 'p1', user: 'Amadou Bamba', type: 'Retard de paiement', amount: 2500, date: '10 Fév 2026', settled: false },
  { id: 'p2', user: 'Sophie Traoré', type: 'Absence de paiement', amount: 5000, date: '08 Fév 2026', settled: true },
];

export default function AdminScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
          </TouchableOpacity>
          <View style={styles.adminBadge}><Text style={styles.adminBadgeText}>Mode Administrateur</Text></View>
        </View>

        <View style={styles.titleRow}>
          <View style={styles.titleIcon}><Feather name="shield" size={24} color={Colors.brand} /></View>
          <View>
            <Text style={styles.title}>Gestion du Groupe</Text>
            <Text style={styles.subtitle}>Tontine Entrepreneurs</Text>
          </View>
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Demandes d'Adhésion</Text>
          <View style={styles.countBadge}><Text style={styles.countText}>{joinRequests.length}</Text></View>
        </View>
        {joinRequests.map((req) => (
          <View key={req.id} style={styles.requestCard}>
            <View style={styles.requestTop}>
              <View style={styles.requestLeft}>
                <View style={styles.requestAvatar}><Text style={styles.requestAvatarText}>{req.avatar}</Text></View>
                <View>
                  <Text style={styles.requestName}>{req.name}</Text>
                  <Text style={styles.requestPhone}>{req.phone}</Text>
                </View>
              </View>
              <Text style={styles.requestDate}>{req.requestDate}</Text>
            </View>
            <View style={styles.requestActions}>
              <TouchableOpacity style={styles.acceptButton}><Feather name="check" size={16} color={Colors.white} /><Text style={styles.acceptText}>Accepter</Text></TouchableOpacity>
              <TouchableOpacity style={styles.rejectButton}><Feather name="x" size={16} color={Colors.white} /><Text style={styles.rejectText}>Refuser</Text></TouchableOpacity>
            </View>
          </View>
        ))}

        <View style={[styles.sectionHeader, { marginTop: 24 }]}>
          <Text style={styles.sectionTitle}>Validations de Paiement</Text>
          <View style={[styles.countBadge, { backgroundColor: Colors.success }]}><Text style={styles.countText}>{paymentValidations.length}</Text></View>
        </View>
        {paymentValidations.map((pay) => (
          <View key={pay.id} style={styles.paymentCard}>
            <View style={styles.paymentTop}>
              <View><Text style={styles.paymentName}>{pay.memberName}</Text><View style={styles.paymentInfo}><Text style={styles.paymentAmount}>{pay.amount.toLocaleString('fr-FR')} F</Text><View style={styles.dot} /><Text style={styles.paymentMethod}>{pay.method}</Text></View></View>
              <Text style={styles.paymentDate}>{pay.date}</Text>
            </View>
            <TouchableOpacity style={styles.confirmButton}><Text style={styles.confirmText}>Confirmer la réception</Text></TouchableOpacity>
          </View>
        ))}

        <View style={[styles.sectionHeader, { marginTop: 24 }]}>
          <Text style={styles.sectionTitle}>Pénalités</Text>
          <View style={[styles.countBadge, { backgroundColor: Colors.accent }]}>
            <Text style={styles.countText}>{penalties.length}</Text>
          </View>
        </View>
        {penalties.map((penalty) => (
          <View key={penalty.id} style={styles.penaltyCard}>
            <View style={styles.paymentTop}>
              <View>
                <Text style={styles.paymentName}>{penalty.user}</Text>
                <View style={styles.paymentInfo}>
                  <Text style={styles.penaltyAmount}>{penalty.amount.toLocaleString('fr-FR')} F</Text>
                  <View style={styles.dot} />
                  <Text style={styles.paymentMethod}>{penalty.type}</Text>
                </View>
              </View>
              <Text style={styles.paymentDate}>{penalty.date}</Text>
            </View>
            <View style={[styles.penaltyStatus, penalty.settled ? styles.penaltyStatusOk : styles.penaltyStatusPending]}>
              <Text style={[styles.penaltyStatusText, { color: penalty.settled ? Colors.success : Colors.accent }]}>
                {penalty.settled ? 'Réglée' : 'À régulariser'}
              </Text>
            </View>
          </View>
        ))}

        <Text style={[styles.sectionTitle, { paddingHorizontal: Theme.spacing.page, marginTop: 24, marginBottom: 16 }]}>Paramètres du Groupe</Text>
        <TouchableOpacity style={styles.settingsItem}>
          <View style={styles.settingsLeft}><View style={[styles.settingsIcon, { backgroundColor: withOpacity(Colors.info, 0.1) }]}><Feather name="settings" size={20} color={Colors.info} /></View><View><Text style={styles.settingsLabel}>Modifier les règles</Text><Text style={styles.settingsDesc}>Montant, fréquence, conditions</Text></View></View>
          <Feather name="chevron-right" size={20} color={Colors.gray[400]} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.settingsItem}>
          <View style={styles.settingsLeft}><View style={[styles.settingsIcon, { backgroundColor: withOpacity(Colors.danger, 0.08) }]}><Feather name="user-minus" size={20} color={Colors.danger} /></View><View><Text style={[styles.settingsLabel, { color: Colors.danger }]}>Exclure un membre</Text><Text style={styles.settingsDesc}>Retirer définitivement du groupe</Text></View></View>
          <Feather name="chevron-right" size={20} color={Colors.gray[400]} />
        </TouchableOpacity>

        <View style={styles.infoBanner}>
          <Feather name="alert-circle" size={20} color={Colors.info} />
          <Text style={styles.infoText}>Les décisions importantes nécessitent l'accord de la majorité des membres actifs.</Text>
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
  adminBadge: { backgroundColor: withOpacity(Colors.brand, 0.1), paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: withOpacity(Colors.brand, 0.2) },
  adminBadgeText: { fontFamily: Fonts.outfit.medium, fontSize: 12, color: Colors.brand },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: Theme.spacing.page, marginBottom: 24 },
  titleIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: withOpacity(Colors.brand, 0.1), alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 24, color: Colors.gray[900] },
  subtitle: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[500] },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Theme.spacing.page, marginBottom: 12 },
  sectionTitle: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 18, color: Colors.gray[900] },
  countBadge: { width: 24, height: 24, borderRadius: 12, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center' },
  countText: { fontFamily: Fonts.outfit.bold, fontSize: 12, color: Colors.white },
  requestCard: { marginHorizontal: Theme.spacing.page, backgroundColor: Colors.gray[50], borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: Colors.gray[100] },
  requestTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  requestLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  requestAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.gray[400], alignItems: 'center', justifyContent: 'center' },
  requestAvatarText: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 14, color: Colors.white },
  requestName: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.gray[900] },
  requestPhone: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500] },
  requestDate: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500] },
  requestActions: { flexDirection: 'row', gap: 8 },
  acceptButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.success, paddingVertical: 12, borderRadius: 12 },
  acceptText: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.white },
  rejectButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: Colors.danger, paddingVertical: 12, borderRadius: 12 },
  rejectText: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.white },
  paymentCard: { marginHorizontal: Theme.spacing.page, backgroundColor: withOpacity(Colors.brand, 0.1), borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: withOpacity(Colors.brand, 0.2) },
  paymentTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 },
  paymentName: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.gray[900], marginBottom: 4 },
  paymentInfo: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  paymentAmount: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 14, color: Colors.brand },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.gray[400] },
  paymentMethod: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[600] },
  paymentDate: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500] },
  confirmButton: { backgroundColor: Colors.brand, paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
  confirmText: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.white },
  penaltyCard: { marginHorizontal: Theme.spacing.page, backgroundColor: withOpacity(Colors.accent, 0.08), borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: withOpacity(Colors.accent, 0.22) },
  penaltyAmount: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 14, color: Colors.accent },
  penaltyStatus: { alignSelf: 'flex-start', borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  penaltyStatusPending: { borderColor: withOpacity(Colors.accent, 0.35), backgroundColor: withOpacity(Colors.accent, 0.12) },
  penaltyStatusOk: { borderColor: withOpacity(Colors.success, 0.35), backgroundColor: withOpacity(Colors.success, 0.1) },
  penaltyStatusText: { fontFamily: Fonts.outfit.medium, fontSize: 12 },
  settingsItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: Theme.spacing.page, backgroundColor: Theme.screen.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: Colors.gray[200], marginBottom: 12 },
  settingsLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  settingsIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  settingsLabel: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.gray[900] },
  settingsDesc: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500] },
  infoBanner: { flexDirection: 'row', gap: 12, marginHorizontal: Theme.spacing.page, backgroundColor: withOpacity(Colors.info, 0.08), borderRadius: 16, padding: 16, marginTop: 24, borderWidth: 1, borderColor: withOpacity(Colors.info, 0.15), alignItems: 'flex-start' },
  infoText: { flex: 1, fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.info },
});
