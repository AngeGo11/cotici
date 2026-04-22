import { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/constants/Colors';
import { Fonts } from '@/constants/Fonts';
import { Theme } from '@/constants/Theme';
import type { AppNotification } from '@/types';

const MOCK_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'n1',
    destinataireId: 'u1',
    expediteurId: 'u2',
    objet: 'Invitation tontine',
    corps: 'Awa Diallo vous invite dans la tontine Famille Solidaire.',
    date: 'Aujourd’hui · 09:14',
    statut: 'EN_ATTENTE',
    estLue: false,
    category: 'invitation',
  },
  {
    id: 'n2',
    destinataireId: 'u1',
    objet: 'Cotisation à venir',
    corps: 'Votre cotisation de 10.000 F est attendue dans 2 jours.',
    date: 'Hier · 18:40',
    statut: 'EN_ATTENTE',
    estLue: false,
    category: 'cotisation',
  },
  {
    id: 'n3',
    destinataireId: 'u1',
    objet: 'Paiement validé',
    corps: 'Votre versement pour la tontine Entrepreneurs a été validé.',
    date: 'Lun. · 13:26',
    statut: 'ACCEPTE',
    estLue: true,
    category: 'paiement',
  },
  {
    id: 'n4',
    destinataireId: 'u1',
    objet: 'Sécurité',
    corps: 'Connexion détectée sur un nouvel appareil.',
    date: 'Dim. · 20:05',
    statut: 'EN_ATTENTE',
    estLue: true,
    category: 'systeme',
  },
];

function getIcon(category: AppNotification['category']) {
  switch (category) {
    case 'invitation':
      return 'mail';
    case 'cotisation':
      return 'clock';
    case 'paiement':
      return 'check-circle';
    default:
      return 'shield';
  }
}

export default function NotificationsScreen() {
  const router = useRouter();
  const [items, setItems] = useState(MOCK_NOTIFICATIONS);

  const unreadCount = useMemo(() => items.filter((n) => !n.estLue).length, [items]);

  const markAllAsRead = () => {
    setItems((prev) => prev.map((n) => ({ ...n, estLue: true })));
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <TouchableOpacity
          style={[styles.readAllButton, unreadCount === 0 && styles.readAllButtonDisabled]}
          onPress={markAllAsRead}
          disabled={unreadCount === 0}
        >
          <Text style={styles.readAllText}>Tout lire</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.subtitle}>
        {unreadCount > 0
          ? `${unreadCount} notification${unreadCount > 1 ? 's' : ''} non lue${unreadCount > 1 ? 's' : ''}`
          : 'Toutes les notifications sont lues'}
      </Text>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {items.map((notification) => (
          <TouchableOpacity
            key={notification.id}
            style={[
              styles.item,
              !notification.estLue && styles.itemUnread,
            ]}
            activeOpacity={0.8}
            onPress={() => {
              if (notification.category === 'invitation') {
                router.push('/invitations');
              }
            }}
          >
            <View
              style={[
                styles.iconWrap,
                { backgroundColor: withOpacity(notification.estLue ? Colors.gray[500] : Colors.primary, 0.12) },
              ]}
            >
              <Feather
                name={getIcon(notification.category)}
                size={18}
                color={notification.estLue ? Colors.gray[500] : Colors.primary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.itemTitle}>{notification.objet}</Text>
              <Text style={styles.itemBody}>{notification.corps}</Text>
              <Text style={styles.itemDate}>{notification.date}</Text>
            </View>
            {!notification.estLue ? <View style={styles.unreadDot} /> : null}
          </TouchableOpacity>
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
  readAllButton: {
    minWidth: 74,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: withOpacity(Colors.primary, 0.3),
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withOpacity(Colors.primary, 0.08),
  },
  readAllButtonDisabled: {
    borderColor: Colors.gray[200],
    backgroundColor: Colors.gray[100],
  },
  readAllText: { fontFamily: Fonts.outfit.medium, fontSize: 12, color: Colors.primary },
  subtitle: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    color: Colors.gray[600],
    paddingHorizontal: Theme.spacing.page,
    marginBottom: 16,
  },
  scroll: { paddingBottom: 16 },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginHorizontal: Theme.spacing.page,
    marginBottom: 10,
    padding: 14,
    borderRadius: Theme.radius.md,
    backgroundColor: Theme.screen.surface,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    ...Theme.shadow.soft,
  },
  itemUnread: {
    borderColor: withOpacity(Colors.primary, 0.25),
    backgroundColor: withOpacity(Colors.primary, 0.04),
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  itemTitle: { fontFamily: Fonts.outfit.medium, fontSize: 15, color: Colors.gray[900], marginBottom: 4 },
  itemBody: { fontFamily: Fonts.outfit.regular, fontSize: 13, color: Colors.gray[600], lineHeight: 18, marginBottom: 8 },
  itemDate: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500] },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.accent,
    marginTop: 8,
  },
});
