import { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput, Alert } from 'react-native';
import { AnimatedPressable, ConfirmSheet, EmptyState, Skeleton, StatusBadge } from '@/shared/ui';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';
import { exclureMembre, fetchMembresGroupe, fetchTontineDetail, type MembreGroupe } from '@/shared/api';

const DEFAULT_NOM = 'ce groupe';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export default function ExclureMembreScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; tontineNom?: string }>();
  const tontineId = typeof params.id === 'string' ? params.id : undefined;
  const tontineNom = useMemo(
    () => (typeof params.tontineNom === 'string' && params.tontineNom ? params.tontineNom : DEFAULT_NOM),
    [params.tontineNom],
  );

  const [members, setMembers] = useState<MembreGroupe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [confirmSheetOpen, setConfirmSheetOpen] = useState(false);
  const [excluding, setExcluding] = useState(false);
  const [ordreMode, setOrdreMode] = useState<'admin' | 'random' | null>(null);

  const load = useCallback(async () => {
    if (!tontineId) {
      setError('Tontine introuvable.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const [membresResult, detailResult] = await Promise.all([
      fetchMembresGroupe(tontineId),
      fetchTontineDetail(tontineId),
    ]);
    if (membresResult.ok) {
      setMembers(membresResult.data.results.filter((m) => !m.is_hote));
    } else {
      setError(membresResult.detail);
    }
    if (detailResult.ok) {
      setOrdreMode(detailResult.data.ordre_mode);
    }
    setLoading(false);
  }, [tontineId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const selected = members.find((m) => m.user_id === selectedUserId);

  const requestExclude = useCallback(() => {
    if (!selected || selected.peut_etre_exclu === false) return;
    setConfirmSheetOpen(true);
  }, [selected]);

  const confirmExclude = useCallback(() => {
    if (!selected || !tontineId) return;
    void (async () => {
      setExcluding(true);
      const result = await exclureMembre({
        tontine_id: Number(tontineId),
        user_id: selected.user_id,
        motif: reason.trim() || undefined,
      });
      setExcluding(false);
      setConfirmSheetOpen(false);
      if (!result.ok) {
        Alert.alert('Erreur', result.detail);
        return;
      }
      router.back();
    })();
  }, [selected, tontineId, reason, router]);

  const renderContent = () => {
    if (loading) {
      return (
        <>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} shape="card" height={78} style={styles.skeletonCard} />
          ))}
        </>
      );
    }

    if (error) {
      return (
        <EmptyState icon="alert-circle" title="Impossible de charger les membres" description={error} actionLabel="Réessayer" onAction={load} />
      );
    }

    if (members.length === 0) {
      return (
        <EmptyState
          icon="users"
          title="Aucun membre à exclure"
          description="Le groupe ne compte pas d'autre membre que l'hôte."
        />
      );
    }

    return (
      <>
        {members.map((m) => {
          const active = selectedUserId === m.user_id;
          const disabled = m.peut_etre_exclu === false;
          return (
            <AnimatedPressable
              key={m.id}
              style={[styles.card, active && styles.cardActive, disabled && styles.cardDisabled]}
              onPress={() => {
                if (disabled) return;
                setSelectedUserId(m.user_id);
              }}
              disabled={disabled}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{initials(m.name)}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.memberName}>{m.name}</Text>
                {m.numero_telephone ? (
                  <Text style={styles.memberPhone}>{m.numero_telephone}</Text>
                ) : null}
                <View style={styles.badgeRow}>
                  <StatusBadge
                    label={m.role === 'ADMINISTRATEUR' ? 'Administrateur' : 'Participant'}
                    tone={m.role === 'ADMINISTRATEUR' ? 'brand' : 'neutral'}
                  />
                  {ordreMode === 'random' ? (
                    <Text style={styles.orderHint}>Bénéficiaire tiré au sort</Text>
                  ) : m.ordre_ramassage > 0 ? (
                    <Text style={styles.orderHint}>Rang {m.ordre_ramassage}</Text>
                  ) : null}
                  {Number(m.penalites_impayees) > 0 ? (
                    <Text style={styles.penaltyHint}>
                      {Number(m.penalites_impayees).toLocaleString('fr-FR')} FCFA dus
                    </Text>
                  ) : null}
                </View>
                {disabled && m.motif_blocage_exclusion ? (
                  <Text style={styles.blockedHint}>{m.motif_blocage_exclusion}</Text>
                ) : null}
              </View>
              <View style={[styles.radio, active && styles.radioOn, disabled && styles.radioDisabled]}>
                {active ? <View style={styles.radioInner} /> : null}
              </View>
            </AnimatedPressable>
          );
        })}

        <View style={styles.field}>
          <Text style={styles.label}>Motif (optionnel)</Text>
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

        <AnimatedPressable
          style={[styles.dangerButton, (!selected || excluding) && styles.dangerButtonDisabled]}
          onPress={requestExclude}
          disabled={!selected || excluding}
        >
          <Feather name="user-minus" size={20} color={Colors.white} />
          <Text style={styles.dangerText}>Exclure du groupe</Text>
        </AnimatedPressable>
      </>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topBar}>
        <AnimatedPressable style={styles.backButton} onPress={() => router.back()}>
          <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
        </AnimatedPressable>
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
          Sélectionnez la personne à retirer du groupe. L&apos;exclusion est irréversible et recompacte
          automatiquement l&apos;ordre de ramassage restant.
        </Text>

        {renderContent()}

        <View style={styles.legalBox}>
          <Feather name="alert-circle" size={18} color={Colors.accent} />
          <Text style={styles.legalText}>
            COTICI enregistre ici le motif à titre indicatif. Validez toute exclusion avec le quorum défini dans vos règles.
          </Text>
        </View>
        <View style={{ height: 32 }} />
      </ScrollView>

      <ConfirmSheet
        visible={confirmSheetOpen}
        title="Exclure ce membre ?"
        description={
          selected
            ? `« ${selected.name} » ne pourra plus participer à cette tontine. Cette action est irréversible et recompacte l'ordre de ramassage des membres restants.`
            : ''
        }
        confirmLabel="Exclure"
        confirmVariant="danger"
        loading={excluding}
        onConfirm={confirmExclude}
        onCancel={() => setConfirmSheetOpen(false)}
      />
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
  skeletonCard: { marginHorizontal: Theme.spacing.page, marginBottom: 10, borderRadius: Theme.radius.lg },
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
  cardDisabled: { opacity: 0.55 },
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
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  orderHint: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500] },
  penaltyHint: { fontFamily: Fonts.outfit.medium, fontSize: 12, color: Colors.danger },
  blockedHint: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 12,
    color: Colors.danger,
    marginTop: 6,
    lineHeight: 16,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.gray[300],
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  radioOn: { borderColor: Colors.danger },
  radioDisabled: { borderColor: Colors.gray[200] },
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
});
