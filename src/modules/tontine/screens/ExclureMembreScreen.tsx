import { useState, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert, TextInput } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';

type MemberRow = { id: string; name: string; avatar: string; phone: string; role?: string };

const INITIAL_MEMBERS: MemberRow[] = [
  { id: '1', name: 'Marie Koné', avatar: 'MK', phone: '+225 07 12 34 56', role: 'Trésorier' },
  { id: '2', name: 'Jean Diabaté', avatar: 'JD', phone: '+225 05 98 11 22' },
  { id: '3', name: 'Fatou Touré', avatar: 'FT', phone: '+225 07 44 55 66' },
  { id: '4', name: 'Amadou Bamba', avatar: 'AB', phone: '+225 01 00 00 00' },
];

const DEFAULT_NOM = 'Tontine Entrepreneurs';

export default function ExclureMembreScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tontineNom?: string }>();
  const tontineNom = useMemo(
    () => (typeof params.tontineNom === 'string' && params.tontineNom ? params.tontineNom : DEFAULT_NOM),
    [params.tontineNom],
  );

  const [members, setMembers] = useState(INITIAL_MEMBERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const selected = members.find((m) => m.id === selectedId);

  const requestExclude = useCallback(() => {
    if (!selected) return;
    const name = selected.name;
    const idToRemove = selected.id;
    const willBeEmpty = members.length <= 1;
    Alert.alert(
      'Exclure ce membre ?',
      `« ${name} » ne pourra plus participer à cette tontine. Cette action doit respecter le quorum et le règlement du groupe.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Exclure',
          style: 'destructive',
          onPress: () => {
            setMembers((prev) => prev.filter((m) => m.id !== idToRemove));
            setSelectedId(null);
            setReason('');
            Alert.alert('Membre exclu', `${name} a été retiré de la tontine (démo).`, [
              { text: 'OK', onPress: () => (willBeEmpty ? router.back() : undefined) },
            ]);
          },
        },
      ],
    );
  }, [selected, members.length, router]);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.85}>
          <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
        </TouchableOpacity>
        <View style={styles.topBarText}>
          <Text style={styles.headerTitle}>Exclure un membre</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {tontineNom}
          </Text>
        </View>
        <View style={styles.backButton} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>
          Sélectionnez la personne à retirer du groupe. L’exclusion est irréversible sur cet appareil (démo).
        </Text>

        {members.length === 0 ? (
          <View style={styles.emptyBox}>
            <Feather name="users" size={40} color={Colors.gray[400]} />
            <Text style={styles.emptyTitle}>Aucun membre à afficher</Text>
            <TouchableOpacity onPress={() => router.back()}>
              <Text style={styles.emptyLink}>Retour</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {members.map((m) => {
              const active = selectedId === m.id;
              return (
                <TouchableOpacity
                  key={m.id}
                  style={[styles.card, active && styles.cardActive]}
                  onPress={() => setSelectedId(m.id)}
                  activeOpacity={0.88}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{m.avatar}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.memberName}>{m.name}</Text>
                    <Text style={styles.memberPhone}>{m.phone}</Text>
                    {m.role ? <Text style={styles.role}>{m.role}</Text> : null}
                  </View>
                  <View style={[styles.radio, active && styles.radioOn]}>
                    {active ? <View style={styles.radioInner} /> : null}
                  </View>
                </TouchableOpacity>
              );
            })}

            <View style={styles.field}>
              <Text style={styles.label}>Motif (recommandé)</Text>
              <TextInput
                value={reason}
                onChangeText={setReason}
                placeholder="Ex. : non-paiement répété, décision du comité…"
                placeholderTextColor={Colors.gray[400]}
                style={styles.textarea}
                multiline
                numberOfLines={2}
                textAlignVertical="top"
              />
            </View>

            <TouchableOpacity
              style={[styles.dangerButton, !selected && styles.dangerButtonDisabled]}
              onPress={requestExclude}
              disabled={!selected}
              activeOpacity={0.9}
            >
              <Feather name="user-minus" size={20} color={Colors.white} />
              <Text style={styles.dangerText}>Exclure du groupe</Text>
            </TouchableOpacity>
          </>
        )}

        <View style={styles.legalBox}>
          <Feather name="alert-circle" size={18} color={Colors.accent} />
          <Text style={styles.legalText}>
            COTICI enregistre ici le motif à titre indicatif. Validez toute exclusion avec le quorum défini dans vos règles.
          </Text>
        </View>
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.screen.bg },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Theme.spacing.page,
    paddingVertical: 10,
    gap: 8,
  },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: Theme.screen.surface, alignItems: 'center', justifyContent: 'center' },
  topBarText: { flex: 1 },
  headerTitle: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 18, color: Colors.gray[900] },
  headerSub: { fontFamily: Fonts.outfit.regular, fontSize: 13, color: Colors.gray[500], marginTop: 2 },
  scroll: { paddingBottom: 24, paddingTop: 4 },
  intro: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 15,
    color: Colors.gray[600],
    lineHeight: 22,
    paddingHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.lg,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: Theme.spacing.page,
    marginBottom: 10,
    padding: 14,
    borderRadius: Theme.radius.lg,
    backgroundColor: Theme.screen.surface,
    borderWidth: 2,
    borderColor: 'transparent',
    ...Theme.shadow.soft,
  },
  cardActive: { borderColor: Colors.danger, backgroundColor: withOpacity(Colors.danger, 0.04) },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.gray[200],
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 14, color: Colors.gray[700] },
  memberName: { fontFamily: Fonts.outfit.medium, fontSize: 16, color: Colors.gray[900] },
  memberPhone: { fontFamily: Fonts.outfit.regular, fontSize: 13, color: Colors.gray[500], marginTop: 2 },
  role: { fontFamily: Fonts.outfit.medium, fontSize: 11, color: Colors.brand, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.3 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.gray[300],
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: Colors.danger },
  radioInner: { width: 12, height: 12, borderRadius: 6, backgroundColor: Colors.danger },
  field: { marginHorizontal: Theme.spacing.page, marginTop: 8, marginBottom: 16 },
  label: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.gray[700], marginBottom: 8 },
  textarea: {
    minHeight: 72,
    backgroundColor: Theme.screen.surface,
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: Fonts.outfit.regular,
    fontSize: 15,
    color: Colors.gray[900],
  },
  dangerButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Colors.danger,
    paddingVertical: 16,
    borderRadius: Theme.radius.lg,
  },
  dangerButtonDisabled: { opacity: 0.45 },
  dangerText: { fontFamily: Fonts.outfit.semiBold, fontSize: 16, color: Colors.white },
  legalBox: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: Theme.spacing.page,
    marginTop: 20,
    padding: 12,
    borderRadius: Theme.radius.md,
    backgroundColor: withOpacity(Colors.accent, 0.08),
    borderWidth: 1,
    borderColor: withOpacity(Colors.accent, 0.2),
  },
  legalText: { flex: 1, fontFamily: Fonts.outfit.regular, fontSize: 13, color: Colors.gray[700], lineHeight: 19 },
  emptyBox: { alignItems: 'center', padding: 40, gap: 8 },
  emptyTitle: { fontFamily: Fonts.outfit.medium, fontSize: 16, color: Colors.gray[600] },
  emptyLink: { fontFamily: Fonts.outfit.medium, fontSize: 15, color: Colors.brand, marginTop: 8 },
});
