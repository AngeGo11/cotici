import { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  TextInput,
} from 'react-native';
import { AnimatedPressable } from '@/shared/ui';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';
import {
  fetchMyInvitations,
  refuseTontineInvitation,
  type TontineInvitation,
} from '@/shared/api';

const frequenceLabel: Record<string, string> = {
  QUOTIDIENNE: 'Quotidienne',
  HEBDOMADAIRE: 'Hebdomadaire',
  MENSUELLE: 'Mensuelle',
  PERSONALISE: 'Personnalisée',
  PERSONNALISE: 'Personnalisée',
};

function formatAmount(n: number): string {
  return `${n.toLocaleString('fr-FR')} F`;
}

/** Extrait un token d'invitation depuis un code brut ou un lien collé. */
function extractToken(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.includes('/')) {
    const parts = trimmed.split(/[/?#]/).filter(Boolean);
    return parts[parts.length - 1] ?? trimmed;
  }
  return trimmed;
}

export default function InvitationsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<TontineInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyToken, setBusyToken] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetchMyInvitations();
    if (res.ok) {
      setItems(res.data);
    } else {
      setError(res.detail);
    }
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const openRules = useCallback(
    (invitation: TontineInvitation) => {
      if (!invitation.regles_definies) {
        Alert.alert(
          'Groupe non prêt',
          "Les règles de ce groupe ne sont pas encore définies. Réessayez plus tard.",
        );
        return;
      }
      router.push({
        pathname: '/join-tontine-rules',
        params: { token: invitation.token },
      });
    },
    [router],
  );

  const refuse = useCallback(
    (invitation: TontineInvitation) => {
      if (busyToken) return;
      Alert.alert(
        'Refuser l\u2019invitation',
        `Refuser l\u2019invitation à « ${invitation.tontine_nom} » ?`,
        [
          { text: 'Annuler', style: 'cancel' },
          {
            text: 'Refuser',
            style: 'destructive',
            onPress: async () => {
              setBusyToken(invitation.token);
              const res = await refuseTontineInvitation(invitation.token);
              setBusyToken(null);
              if (res.ok) {
                setItems((prev) => prev.filter((i) => i.token !== invitation.token));
              } else {
                Alert.alert('Erreur', res.detail);
              }
            },
          },
        ],
      );
    },
    [busyToken],
  );

  const joinByCode = useCallback(() => {
    const token = extractToken(joinCode);
    if (!token) {
      Alert.alert('Code requis', 'Collez le code ou le lien d\u2019invitation reçu.');
      return;
    }
    setJoinCode('');
    router.push({ pathname: '/join-tontine-rules', params: { token } });
  }, [joinCode, router]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <AnimatedPressable style={styles.backButton} onPress={() => router.back()}>
          <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>Invitations reçues</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <Text style={styles.subtitle}>
          Rejoignez les tontines de groupe auxquelles vous avez été invité·e.
        </Text>

        <View style={styles.joinCard}>
          <Text style={styles.joinTitle}>Rejoindre avec un code</Text>
          <Text style={styles.joinHint}>
            Collez le code ou le lien d&apos;invitation reçu par SMS.
          </Text>
          <View style={styles.joinRow}>
            <TextInput
              value={joinCode}
              onChangeText={setJoinCode}
              placeholder="Code ou lien d'invitation"
              placeholderTextColor={Colors.gray[400]}
              style={styles.joinInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
              <AnimatedPressable
                style={[styles.joinButton, !joinCode.trim() && styles.joinButtonDisabled]}
                onPress={joinByCode}
                disabled={!joinCode.trim()}
              >
                <Feather name="arrow-right" size={18} color={Colors.white} />
              </AnimatedPressable>
          </View>
        </View>

        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator size="large" color={Colors.brand} />
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{error}</Text>
            <AnimatedPressable style={styles.retryButton} onPress={() => void load()}>
              <Text style={styles.retryText}>Réessayer</Text>
            </AnimatedPressable>
          </View>
        ) : items.length === 0 ? (
          <View style={styles.emptyWrap}>
            <View style={styles.emptyIcon}>
              <Feather name="mail" size={26} color={Colors.gray[400]} />
            </View>
            <Text style={styles.emptyTitle}>Aucune invitation en attente</Text>
            <Text style={styles.emptyText}>
              Les invitations envoyées à votre numéro apparaîtront ici.
            </Text>
          </View>
        ) : (
          items.map((invitation) => {
            const busy = busyToken === invitation.token;
            const freq = invitation.frequence ? frequenceLabel[invitation.frequence] ?? invitation.frequence : null;
            return (
              <View key={invitation.token} style={styles.card}>
                <View style={styles.topRow}>
                  <View style={styles.iconWrap}>
                    <Feather name="users" size={18} color={Colors.brand} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.title}>{invitation.tontine_nom}</Text>
                    <Text style={styles.meta}>Invité·e par {invitation.hote_nom}</Text>
                  </View>
                </View>

                <View style={styles.infoRow}>
                  <View style={styles.infoItem}>
                    <Feather name="user" size={13} color={Colors.gray[500]} />
                    <Text style={styles.infoText}>
                      {invitation.membres_actifs}/{invitation.nombre_max} membres
                    </Text>
                  </View>
                  <View style={styles.infoItem}>
                    <Feather name="credit-card" size={13} color={Colors.gray[500]} />
                    <Text style={styles.infoText}>{formatAmount(invitation.cotisation_amount)}</Text>
                  </View>
                  {freq ? (
                    <View style={styles.infoItem}>
                      <Feather name="repeat" size={13} color={Colors.gray[500]} />
                      <Text style={styles.infoText}>{freq}</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.actionsRow}>
                  <AnimatedPressable
                    style={[styles.acceptButton, busy && styles.buttonDisabled]}
                    onPress={() => openRules(invitation)}
                    disabled={busy}
                  >
                    <Feather name="file-text" size={16} color={Colors.white} />
                    <Text style={styles.acceptText}>Voir les règles</Text>
                  </AnimatedPressable>
                  <AnimatedPressable
                    style={[styles.rejectButton, busy && styles.buttonDisabled]}
                    onPress={() => refuse(invitation)}
                    disabled={busy}
                  >
                    <Feather name="x" size={16} color={Colors.danger} />
                    <Text style={styles.rejectText}>Refuser</Text>
                  </AnimatedPressable>
                </View>
              </View>
            );
          })
        )}
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
  scroll: { paddingBottom: 16 },
  subtitle: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    color: Colors.gray[600],
    paddingHorizontal: Theme.spacing.page,
    marginBottom: 16,
  },
  joinCard: {
    marginHorizontal: Theme.spacing.page,
    marginBottom: 20,
    borderRadius: Theme.radius.md,
    padding: 16,
    backgroundColor: Theme.screen.surface,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    ...Theme.shadow.soft,
  },
  joinTitle: { fontFamily: Fonts.outfit.semiBold, fontSize: 15, color: Colors.gray[900], marginBottom: 4 },
  joinHint: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500], marginBottom: 12 },
  joinRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  joinInput: {
    flex: 1,
    height: 48,
    borderRadius: Theme.radius.md,
    backgroundColor: Colors.gray[50],
    borderWidth: 1,
    borderColor: Colors.gray[200],
    paddingHorizontal: 14,
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    color: Colors.gray[900],
  },
  joinButton: {
    width: 48,
    height: 48,
    borderRadius: Theme.radius.md,
    backgroundColor: Colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinButtonDisabled: { opacity: 0.5 },
  centered: { alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 12 },
  errorText: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.danger, textAlign: 'center', paddingHorizontal: Theme.spacing.page },
  retryButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: Theme.radius.pill,
    backgroundColor: withOpacity(Colors.brand, 0.12),
  },
  retryText: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.brand },
  emptyWrap: { alignItems: 'center', paddingVertical: 32, paddingHorizontal: 32 },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  emptyTitle: { fontFamily: Fonts.outfit.semiBold, fontSize: 16, color: Colors.gray[800], marginBottom: 6 },
  emptyText: { fontFamily: Fonts.outfit.regular, fontSize: 13, color: Colors.gray[500], textAlign: 'center' },
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
  topRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: withOpacity(Colors.brand, 0.12),
  },
  title: { fontFamily: Fonts.outfit.medium, fontSize: 15, color: Colors.gray[900], marginBottom: 3 },
  meta: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500] },
  infoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, marginBottom: 14 },
  infoItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  infoText: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[600] },
  actionsRow: { flexDirection: 'row', gap: 8 },
  acceptButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.brand,
    borderRadius: 12,
    paddingVertical: 12,
  },
  rejectButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: withOpacity(Colors.danger, 0.1),
    borderRadius: 12,
    paddingVertical: 12,
  },
  buttonDisabled: { opacity: 0.6 },
  acceptText: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.white },
  rejectText: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.danger },
});
