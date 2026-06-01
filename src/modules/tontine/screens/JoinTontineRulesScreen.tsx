import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { AnimatedPressable } from '@/shared/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';
import {
  acceptTontineInvitation,
  previewTontineInvitation,
  type TontineInvitation,
} from '@/shared/api';

function frequenceLabel(f: string | null, days?: number | null): string {
  const map: Record<string, string> = {
    JOURNALIER: 'Journalière',
    HEBDOMADAIRE: 'Hebdomadaire',
    MENSUEL: 'Mensuelle',
    'PERSONNALISÉE': 'Personnalisée',
    PERSONALISE: 'Personnalisée',
  };
  if (f === 'PERSONNALISÉE' || f === 'PERSONALISE') {
    return days ? `Tous les ${days} jours` : 'Personnalisée';
  }
  return f ? (map[f] ?? f) : '—';
}

function ordreLabel(o: string | null | undefined): string {
  if (!o) return '—';
  const u = o.toUpperCase();
  if (u.includes('ADMIN') || u.includes('DÉFINI') || u.includes('DEFINI')) {
    return "Défini par l'administrateur";
  }
  return 'Aléatoire';
}

function RuleRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.ruleRow}>
      <Text style={styles.ruleLabel}>{label}</Text>
      <Text style={styles.ruleValue}>{value}</Text>
    </View>
  );
}

export default function JoinTontineRulesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = typeof params.token === 'string' ? params.token.trim() : '';

  const [invitation, setInvitation] = useState<TontineInvitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState(false);
  const [acceptedRules, setAcceptedRules] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!token) {
      setError('Invitation invalide.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await previewTontineInvitation(token);
    if (res.ok) {
      if (!res.data.regles_definies) {
        setError('Les règles de ce groupe ne sont pas encore définies.');
        setInvitation(null);
      } else {
        setInvitation(res.data);
      }
    } else {
      setError(res.detail);
      setInvitation(null);
    }
    setLoading(false);
  }, [token]);

  useEffect(() => {
    void load();
  }, [load]);

  const join = useCallback(async () => {
    if (!token || !acceptedRules) return;
    setAccepting(true);
    const res = await acceptTontineInvitation({ token, accepte_regles: true });
    setAccepting(false);
    if (res.ok) {
      Alert.alert('Bienvenue !', `Vous avez rejoint « ${res.data.nom} ».`, [
        {
          text: 'Voir le groupe',
          onPress: () =>
            router.replace({
              pathname: '/tontine-details',
              params: { id: String(res.data.id) },
            }),
        },
      ]);
    } else {
      Alert.alert('Impossible de rejoindre', res.detail);
    }
  }, [token, acceptedRules, router]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <AnimatedPressable style={styles.backButton} onPress={() => router.back()}>
          <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>Règles du groupe</Text>
        <View style={{ width: 40 }} />
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.brand} />
        </View>
      ) : error || !invitation ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error ?? 'Invitation introuvable.'}</Text>
          <AnimatedPressable style={styles.retryButton} onPress={() => void load()}>
            <Text style={styles.retryText}>Réessayer</Text>
          </AnimatedPressable>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
            <View style={styles.hero}>
              <Text style={styles.tontineName}>{invitation.tontine_nom}</Text>
              <Text style={styles.heroMeta}>Invité·e par {invitation.hote_nom}</Text>
              {invitation.description ? (
                <Text style={styles.description}>{invitation.description}</Text>
              ) : null}
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Objectif et cotisations</Text>
              <RuleRow
                label="Objectif de la collecte"
                value={`${invitation.objectif_total.toLocaleString('fr-FR')} FCFA`}
              />
              <RuleRow
                label="Mise par participant"
                value={`${invitation.cotisation_amount.toLocaleString('fr-FR')} FCFA / tour`}
              />
              <RuleRow
                label="Pot par tour"
                value={`${invitation.pot_par_tour.toLocaleString('fr-FR')} FCFA`}
              />
              <RuleRow
                label="Nombre de tours"
                value={String(invitation.nombre_tours)}
              />
              <RuleRow label="Participants" value={`${invitation.nombre_max} max`} />
              <RuleRow
                label="Fréquence"
                value={frequenceLabel(
                  invitation.frequence,
                  invitation.frequence_personnalise,
                )}
              />
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Fonctionnement</Text>
              <RuleRow
                label="Ordre de ramassage"
                value={ordreLabel(invitation.ordre_ramassage)}
              />
              <RuleRow
                label="Pénalités"
                value={
                  invitation.penalites_actives
                    ? `${invitation.montant_penalite?.toLocaleString('fr-FR') ?? '0'} FCFA`
                    : 'Désactivées'
                }
              />
              <Text style={styles.hint}>
                Les cotisations se font tour à tour, dans l&apos;ordre de ramassage. Vous ne
                pourrez payer que lorsque ce sera votre tour.
              </Text>
            </View>

            <AnimatedPressable
              style={styles.checkRow}
              onPress={() => setAcceptedRules((v) => !v)}
            >
              <View style={[styles.checkbox, acceptedRules && styles.checkboxOn]}>
                {acceptedRules ? (
                  <Feather name="check" size={16} color={Colors.white} />
                ) : null}
              </View>
              <Text style={styles.checkLabel}>
                J&apos;ai lu et j&apos;accepte les règles de cette tontine de groupe.
              </Text>
            </AnimatedPressable>
          </ScrollView>

          <View style={styles.footer}>
            <AnimatedPressable
              style={[styles.joinButton, (!acceptedRules || accepting) && styles.joinDisabled]}
              onPress={join}
              disabled={!acceptedRules || accepting}
            >
              {accepting ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <>
                  <Feather name="user-plus" size={18} color={Colors.white} />
                  <Text style={styles.joinText}>Rejoindre le groupe</Text>
                </>
              )}
            </AnimatedPressable>
          </View>
        </>
      )}
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
  headerTitle: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 18, color: Colors.gray[900] },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  errorText: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.danger, textAlign: 'center' },
  retryButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: Theme.radius.pill,
    backgroundColor: withOpacity(Colors.brand, 0.12),
  },
  retryText: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.brand },
  scroll: { paddingHorizontal: Theme.spacing.page, paddingBottom: 24 },
  hero: { marginBottom: 20 },
  tontineName: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 24, color: Colors.gray[900] },
  heroMeta: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[500], marginTop: 4 },
  description: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    color: Colors.gray[600],
    marginTop: 10,
    lineHeight: 20,
  },
  card: {
    backgroundColor: Theme.screen.surface,
    borderRadius: Theme.radius.md,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    ...Theme.shadow.soft,
  },
  cardTitle: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 15,
    color: Colors.gray[900],
    marginBottom: 12,
  },
  ruleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 10,
  },
  ruleLabel: { flex: 1, fontFamily: Fonts.outfit.regular, fontSize: 13, color: Colors.gray[500] },
  ruleValue: {
    flex: 1,
    fontFamily: Fonts.outfit.medium,
    fontSize: 13,
    color: Colors.gray[900],
    textAlign: 'right',
  },
  hint: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 12,
    color: Colors.gray[500],
    marginTop: 6,
    lineHeight: 18,
  },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginTop: 8 },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.gray[300],
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxOn: { backgroundColor: Colors.brand, borderColor: Colors.brand },
  checkLabel: { flex: 1, fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[700], lineHeight: 20 },
  footer: {
    paddingHorizontal: Theme.spacing.page,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[100],
  },
  joinButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.brand,
    paddingVertical: 14,
    borderRadius: Theme.radius.md,
  },
  joinDisabled: { opacity: 0.5 },
  joinText: { fontFamily: Fonts.outfit.semiBold, fontSize: 16, color: Colors.white },
});
