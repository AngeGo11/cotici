import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/constants/Colors';
import { Fonts } from '@/constants/Fonts';
import { Theme } from '@/constants/Theme';
import type { Invitation } from '@/types';

const INITIAL_INVITATIONS: Invitation[] = [
  {
    id: 'i1',
    idHote: 'u12',
    numTelInvite: '+2250712345678',
    idTontine: 't1',
    lien: 'https://cotici.app/invite/AXE784',
    statut: 'EN_ATTENTE',
    createdAt: 'Aujourd’hui · 10:12',
    tontineNom: 'Tontine Famille Solidaire',
  },
  {
    id: 'i2',
    idHote: 'u3',
    numTelInvite: '+2250500112233',
    idTontine: 't9',
    lien: 'https://cotici.app/invite/KON504',
    statut: 'ACCEPTE',
    createdAt: 'Hier · 08:40',
    tontineNom: 'Entrepreneurs Cocody',
  },
];

const statusLabel: Record<Invitation['statut'], string> = {
  EN_ATTENTE: 'En attente',
  ACCEPTE: 'Acceptée',
  REFUSE: 'Refusée',
};

const statusColor: Record<Invitation['statut'], string> = {
  EN_ATTENTE: Colors.accent,
  ACCEPTE: Colors.success,
  REFUSE: Colors.danger,
};

export default function InvitationsScreen() {
  const router = useRouter();
  const [items, setItems] = useState(INITIAL_INVITATIONS);

  const updateStatus = (id: string, statut: Invitation['statut']) => {
    setItems((prev) => prev.map((inv) => (inv.id === id ? { ...inv, statut } : inv)));
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Invitations</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={styles.subtitle}>
        Gérez vos invitations de tontine (acceptation, refus, suivi du statut).
      </Text>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {items.map((invitation) => (
          <View key={invitation.id} style={styles.card}>
            <View style={styles.topRow}>
              <View style={styles.iconWrap}>
                <Feather name="users" size={18} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{invitation.tontineNom}</Text>
                <Text style={styles.meta}>Reçue: {invitation.createdAt}</Text>
              </View>
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor: withOpacity(statusColor[invitation.statut], 0.14),
                    borderColor: withOpacity(statusColor[invitation.statut], 0.35),
                  },
                ]}
              >
                <Text style={[styles.statusText, { color: statusColor[invitation.statut] }]}>
                  {statusLabel[invitation.statut]}
                </Text>
              </View>
            </View>

            <Text style={styles.link} numberOfLines={1}>
              {invitation.lien}
            </Text>

            {invitation.statut === 'EN_ATTENTE' ? (
              <View style={styles.actionsRow}>
                <TouchableOpacity
                  style={styles.acceptButton}
                  onPress={() => updateStatus(invitation.id, 'ACCEPTE')}
                >
                  <Feather name="check" size={16} color={Colors.white} />
                  <Text style={styles.acceptText}>Accepter</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.rejectButton}
                  onPress={() => updateStatus(invitation.id, 'REFUSE')}
                >
                  <Feather name="x" size={16} color={Colors.white} />
                  <Text style={styles.rejectText}>Refuser</Text>
                </TouchableOpacity>
              </View>
            ) : null}
          </View>
        ))}
        <View style={{ height: 24 }} />
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
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 20, color: Colors.gray[900] },
  subtitle: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    color: Colors.gray[600],
    paddingHorizontal: Theme.spacing.page,
    marginBottom: 16,
  },
  scroll: { paddingBottom: 16 },
  card: {
    marginHorizontal: Theme.spacing.page,
    marginBottom: 12,
    borderRadius: Theme.radius.md,
    padding: 14,
    backgroundColor: Theme.screen.surface,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    ...Theme.shadow.soft,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withOpacity(Colors.primary, 0.12),
  },
  title: { fontFamily: Fonts.outfit.medium, fontSize: 15, color: Colors.gray[900], marginBottom: 3 },
  meta: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500] },
  statusBadge: {
    borderWidth: 1,
    borderRadius: Theme.radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  statusText: { fontFamily: Fonts.outfit.medium, fontSize: 12 },
  link: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 12,
    color: Colors.gray[500],
    marginBottom: 12,
  },
  actionsRow: { flexDirection: 'row', gap: 8 },
  acceptButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 12,
  },
  rejectButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.danger,
    borderRadius: 12,
    paddingVertical: 12,
  },
  acceptText: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.white },
  rejectText: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.white },
});
