import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/constants/Colors';
import { Fonts } from '@/constants/Fonts';
import { Theme } from '@/constants/Theme';
import type { Member } from '@/types';

const members: Member[] = [
  { id: '1', name: 'Marie Koné', avatar: 'MK', status: 'paid', amount: 10000, turn: 1 },
  { id: '2', name: 'Jean Diabaté', avatar: 'JD', status: 'paid', amount: 10000, turn: 2 },
  { id: '3', name: 'Fatou Touré', avatar: 'FT', status: 'current', amount: 10000, turn: 3 },
  { id: '4', name: 'Amadou Bamba', avatar: 'AB', status: 'late', amount: 10000, turn: 4 },
];

const statusConfig = {
  paid: { label: 'Payé', color: Colors.success, bg: withOpacity(Colors.success, 0.1) },
  current: { label: 'En attente', color: Colors.brand, bg: withOpacity(Colors.brand, 0.1) },
  late: { label: 'Retard', color: Colors.danger, bg: withOpacity(Colors.danger, 0.06) },
};

export default function TontineDetailsScreen() {
  const router = useRouter();
  const paidCount = members.filter((m) => m.status === 'paid').length;
  const totalAmount = members.reduce((sum, m) => sum + (m.amount || 0), 0);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
          </TouchableOpacity>
          <View style={styles.headerActions}>
            <TouchableOpacity onPress={() => router.push('/admin')}><Text style={styles.adminLink}>Admin</Text></TouchableOpacity>
            <View style={styles.dot} />
            <TouchableOpacity style={styles.chatLink} onPress={() => router.push('/chat')}><Feather name="message-circle" size={16} color={Colors.brand} /><Text style={styles.chatLinkText}>Discussion</Text></TouchableOpacity>
          </View>
        </View>

        <View style={styles.titleRow}>
          <View style={styles.titleIcon}><Feather name="users" size={24} color={Colors.white} /></View>
          <View><Text style={styles.title}>Tontine Famille</Text><Text style={styles.subtitle}>Tour 3 sur 12</Text></View>
        </View>

        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View><Text style={styles.summaryLabel}>Cotisation mensuelle</Text><Text style={styles.summaryAmount}>{totalAmount.toLocaleString('fr-FR')} <Text style={{ fontSize: 16 }}>FCFA</Text></Text></View>
            <View style={{ alignItems: 'flex-end' }}><Text style={styles.summaryLabel}>Progression</Text><Text style={styles.summaryProgress}>{paidCount}/{members.length}</Text></View>
          </View>
          <View style={styles.progressBar}><View style={[styles.progressFill, { width: `${(paidCount / members.length) * 100}%` }]} /></View>
        </View>

        <View style={styles.membersHeader}><Text style={styles.membersTitle}>Membres ({members.length})</Text></View>
        {members.map((m) => { const cfg = statusConfig[m.status]; return (
          <View key={m.id} style={styles.memberItem}>
            <View style={styles.memberLeft}><View style={styles.memberAvatar}><Text style={styles.memberAvatarText}>{m.avatar}</Text></View><View><Text style={styles.memberName}>{m.name}</Text><Text style={styles.memberTurn}>Tour {m.turn}</Text></View></View>
            <View style={[styles.badge, { backgroundColor: cfg.bg }]}><Text style={[styles.badgeText, { color: cfg.color }]}>{cfg.label}</Text></View>
          </View>
        ); })}

        <TouchableOpacity style={styles.payButton} onPress={() => router.push('/make-deposit')}><Text style={styles.payButtonText}>Payer ma cotisation</Text></TouchableOpacity>
        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.screen.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: Theme.spacing.page, paddingVertical: 12 },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.gray[100], alignItems: 'center', justifyContent: 'center' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  adminLink: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.brand },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: Colors.gray[300] },
  chatLink: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  chatLinkText: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.brand },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: Theme.spacing.page, marginBottom: 24 },
  titleIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 24, color: Colors.gray[900] },
  subtitle: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[500] },
  summaryCard: { marginHorizontal: Theme.spacing.page, backgroundColor: withOpacity(Colors.success, 0.1), borderRadius: 24, padding: 20, marginBottom: 24, borderWidth: 1, borderColor: withOpacity(Colors.success, 0.2) },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  summaryLabel: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[600], marginBottom: 4 },
  summaryAmount: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 24, color: Colors.gray[900] },
  summaryProgress: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 20, color: Colors.success },
  progressBar: { height: 8, backgroundColor: Colors.gray[200], borderRadius: 4 },
  progressFill: { height: 8, backgroundColor: Colors.success, borderRadius: 4 },
  membersHeader: { paddingHorizontal: Theme.spacing.page, marginBottom: 12 },
  membersTitle: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 20, color: Colors.gray[900] },
  memberItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: Theme.spacing.page, backgroundColor: Colors.gray[50], borderRadius: 16, padding: 16, marginBottom: 8 },
  memberLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  memberAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center' },
  memberAvatarText: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 14, color: Colors.white },
  memberName: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.gray[900] },
  memberTurn: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500] },
  badge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  badgeText: { fontFamily: Fonts.outfit.medium, fontSize: 12 },
  payButton: { marginHorizontal: Theme.spacing.page, marginTop: 16, backgroundColor: Colors.brand, paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
  payButtonText: { fontFamily: Fonts.outfit.medium, fontSize: 16, color: Colors.white },
});
