import { useCallback, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert } from 'react-native';
import { AnimatedPressable, ConfirmSheet, EmptyState, Skeleton, StatusBadge } from '@/shared/ui';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';
import { useAuth } from '@/shared/auth';
import { fetchMembresGroupe, fetchTontineDetail, setMemberRole, type MembreGroupe } from '@/shared/api';

const DEFAULT_NOM = 'ce groupe';

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export default function MembresGroupeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ id?: string; tontineNom?: string }>();
  const tontineId = typeof params.id === 'string' ? params.id : undefined;
  const tontineNom = useMemo(
    () => (typeof params.tontineNom === 'string' && params.tontineNom ? params.tontineNom : DEFAULT_NOM),
    [params.tontineNom],
  );

  const [members, setMembers] = useState<MembreGroupe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState<MembreGroupe | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
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
      setMembers(membresResult.data.results);
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

  const isHost = user?.id != null && members.some((m) => m.is_hote && m.user_id === user.id);

  const requestToggleRole = useCallback((member: MembreGroupe) => {
    setTarget(member);
  }, []);

  const confirmToggleRole = useCallback(() => {
    if (!target || !tontineId) return;
    const nextRole = target.role === 'ADMINISTRATEUR' ? 'PARTICIPANT' : 'ADMINISTRATEUR';
    void (async () => {
      setUpdatingId(target.user_id);
      const result = await setMemberRole({
        tontine_id: Number(tontineId),
        user_id: target.user_id,
        role: nextRole,
      });
      setUpdatingId(null);
      setTarget(null);
      if (!result.ok) {
        Alert.alert('Erreur', result.detail);
        return;
      }
      await load();
    })();
  }, [target, tontineId, load]);

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
      return <EmptyState icon="users" title="Aucun membre" description="Ce groupe ne compte aucun membre actif." />;
    }

    return members.map((m) => {
      const isAdmin = m.role === 'ADMINISTRATEUR';
      return (
        <View key={m.id} style={styles.card}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials(m.name)}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.memberName}>{m.name}</Text>
            {m.numero_telephone ? (
              <Text style={styles.memberPhone}>{m.numero_telephone}</Text>
            ) : null}
            <View style={styles.badgeRow}>
              {m.is_hote ? (
                <StatusBadge label="Hôte" tone="brand" />
              ) : (
                <StatusBadge label={isAdmin ? 'Administrateur' : 'Participant'} tone={isAdmin ? 'info' : 'neutral'} />
              )}
              {ordreMode === 'random' ? (
                <Text style={styles.orderHint}>Bénéficiaire tiré au sort</Text>
              ) : m.ordre_ramassage > 0 ? (
                <Text style={styles.orderHint}>Rang {m.ordre_ramassage}</Text>
              ) : null}
            </View>
          </View>
          {isHost && !m.is_hote ? (
            <AnimatedPressable
              style={styles.roleButton}
              onPress={() => requestToggleRole(m)}
              disabled={updatingId === m.user_id}
              accessibilityRole="button"
              accessibilityLabel={isAdmin ? 'Rétrograder en participant' : 'Promouvoir administrateur'}
            >
              <Feather name={isAdmin ? 'arrow-down-circle' : 'arrow-up-circle'} size={16} color={Colors.brand} />
              <Text style={styles.roleButtonText}>{isAdmin ? 'Rétrograder' : 'Promouvoir'}</Text>
            </AnimatedPressable>
          ) : null}
        </View>
      );
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.topBar}>
        <AnimatedPressable style={styles.backButton} onPress={() => router.back()}>
          <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
        </AnimatedPressable>
        <View style={styles.topBarText}>
          <Text style={styles.headerTitle}>Membres du groupe</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {tontineNom}
          </Text>
        </View>
        <View style={styles.backButton} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {isHost ? (
          <Text style={styles.intro}>
            En tant qu&apos;hôte, vous pouvez promouvoir un membre administrateur ou le rétrograder participant.
          </Text>
        ) : null}

        {renderContent()}

        {!loading && !error && members.length > 0 ? (
          <AnimatedPressable
            style={styles.excludeLink}
            onPress={() => router.push({ pathname: '/exclure-membre', params: { id: tontineId, tontineNom } })}
          >
            <Feather name="user-minus" size={18} color={Colors.danger} />
            <Text style={styles.excludeLinkText}>Exclure un membre</Text>
          </AnimatedPressable>
        ) : null}

        <View style={{ height: 32 }} />
      </ScrollView>

      <ConfirmSheet
        visible={target !== null}
        title={target?.role === 'ADMINISTRATEUR' ? 'Rétrograder ce membre ?' : 'Promouvoir cet administrateur ?'}
        description={
          target
            ? target.role === 'ADMINISTRATEUR'
              ? `« ${target.name} » perdra ses droits d'administration sur le groupe.`
              : `« ${target.name} » pourra gérer les membres, les règles et les pénalités du groupe.`
            : ''
        }
        confirmLabel={target?.role === 'ADMINISTRATEUR' ? 'Rétrograder' : 'Promouvoir'}
        confirmVariant={target?.role === 'ADMINISTRATEUR' ? 'danger' : 'primary'}
        loading={updatingId !== null}
        onConfirm={confirmToggleRole}
        onCancel={() => setTarget(null)}
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
    fontSize: 14,
    color: Colors.gray[600],
    lineHeight: 20,
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
    borderWidth: 1,
    borderColor: Colors.gray[100],
    ...Theme.shadow.soft,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 14, color: Colors.white },
  memberName: { fontFamily: Fonts.outfit.medium, fontSize: 16, color: Colors.gray[900] },
  memberPhone: { fontFamily: Fonts.outfit.regular, fontSize: 13, color: Colors.gray[500], marginTop: 2 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  orderHint: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500] },
  roleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: Theme.radius.md,
    backgroundColor: withOpacity(Colors.brand, 0.1),
  },
  roleButtonText: { fontFamily: Fonts.outfit.medium, fontSize: 12, color: Colors.brand },
  excludeLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: Theme.spacing.page,
    marginTop: Theme.spacing.lg,
    paddingVertical: 14,
    borderRadius: Theme.radius.lg,
    borderWidth: 1,
    borderColor: withOpacity(Colors.danger, 0.25),
    backgroundColor: withOpacity(Colors.danger, 0.05),
  },
  excludeLinkText: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.danger },
});
