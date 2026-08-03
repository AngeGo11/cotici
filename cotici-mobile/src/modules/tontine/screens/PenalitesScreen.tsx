import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TextInput, Alert, Modal } from 'react-native';
import { AnimatedPressable, AmountText, ConfirmSheet, EmptyState, Skeleton, StatusBadge } from '@/shared/ui';
import type { StatusTone } from '@/shared/ui';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';
import {
  attribuerPenalite,
  annulerPenalite,
  fetchMembresGroupe,
  fetchPenalites,
  reglerPenalite,
  type MembreGroupe,
  type Penalite,
  type PenaliteFilter,
} from '@/shared/api';
import { useTontineDetail } from '@/modules/tontine/hooks/useTontineDetail';

const DEFAULT_NOM = 'ce groupe';

const FILTERS: { value: PenaliteFilter; label: string }[] = [
  { value: 'impayees', label: 'Impayées' },
  { value: 'reglees', label: 'Réglées' },
  { value: 'toutes', label: 'Toutes' },
];

const PENALITE_TYPES: { value: 'RETARD PAIEMENT' | 'ABSENCE PAIEMENT'; label: string }[] = [
  { value: 'RETARD PAIEMENT', label: 'Retard de paiement' },
  { value: 'ABSENCE PAIEMENT', label: 'Absence de paiement' },
];

function typeLabel(type: Penalite['type_penalite']): string {
  return type === 'RETARD PAIEMENT' ? 'Retard de paiement' : 'Absence de paiement';
}

function statutConfig(p: Penalite): { label: string; tone: StatusTone } {
  if (p.est_reglee) return { label: 'Réglée', tone: 'success' };
  return { label: 'Impayée', tone: 'warning' };
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

export default function PenalitesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; tontineNom?: string }>();
  const tontineId = typeof params.id === 'string' ? params.id : undefined;
  const { detail } = useTontineDetail(tontineId);
  const tontineNom = useMemo(
    () => detail?.nom ?? (typeof params.tontineNom === 'string' && params.tontineNom ? params.tontineNom : DEFAULT_NOM),
    [detail?.nom, params.tontineNom],
  );

  const [filter, setFilter] = useState<PenaliteFilter>('impayees');
  const [penalites, setPenalites] = useState<Penalite[]>([]);
  const [totalImpaye, setTotalImpaye] = useState('0');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionTarget, setActionTarget] = useState<{ penalite: Penalite; action: 'regler' | 'annuler' } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  const [attributeOpen, setAttributeOpen] = useState(false);
  const [members, setMembers] = useState<MembreGroupe[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [selectedType, setSelectedType] = useState<'RETARD PAIEMENT' | 'ABSENCE PAIEMENT'>('RETARD PAIEMENT');
  const [motif, setMotif] = useState('');
  const [attributing, setAttributing] = useState(false);

  const load = useCallback(async () => {
    if (!tontineId) {
      setError('Tontine introuvable.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchPenalites(tontineId, filter);
    if (result.ok) {
      setPenalites(result.data.results);
      setTotalImpaye(result.data.total_impaye);
    } else {
      setError(result.detail);
    }
    setLoading(false);
  }, [tontineId, filter]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const isAdmin = detail?.is_admin ?? false;

  const memberName = useCallback(
    (userId: number) => members.find((m) => m.user_id === userId)?.name ?? `Membre #${userId}`,
    [members],
  );

  useEffect(() => {
    if (!isAdmin || members.length > 0 || membersLoading || !tontineId) return;
    void (async () => {
      setMembersLoading(true);
      const result = await fetchMembresGroupe(tontineId);
      setMembersLoading(false);
      if (result.ok) setMembers(result.data.results);
    })();
  }, [isAdmin, members.length, membersLoading, tontineId]);

  const openAttributeForm = async () => {
    if (!tontineId) return;
    setAttributeOpen(true);
    if (members.length === 0 && !membersLoading) {
      setMembersLoading(true);
      const result = await fetchMembresGroupe(tontineId);
      setMembersLoading(false);
      if (result.ok) setMembers(result.data.results);
    }
  };

  const confirmAction = useCallback(() => {
    if (!actionTarget) return;
    void (async () => {
      setActionLoading(true);
      const result =
        actionTarget.action === 'regler'
          ? await reglerPenalite(actionTarget.penalite.id)
          : await annulerPenalite(actionTarget.penalite.id);
      setActionLoading(false);
      setActionTarget(null);
      if (!result.ok) {
        Alert.alert('Erreur', result.detail);
        return;
      }
      await load();
    })();
  }, [actionTarget, load]);

  const submitAttribution = () => {
    if (!tontineId || selectedUserId === null) {
      Alert.alert('Sélection requise', 'Choisissez un membre.');
      return;
    }
    void (async () => {
      setAttributing(true);
      const result = await attribuerPenalite({
        tontine_id: Number(tontineId),
        user_id: selectedUserId,
        type_penalite: selectedType,
        motif: motif.trim() || undefined,
      });
      setAttributing(false);
      if (!result.ok) {
        Alert.alert('Erreur', result.detail);
        return;
      }
      setAttributeOpen(false);
      setSelectedUserId(null);
      setMotif('');
      await load();
    })();
  };

  const renderList = () => {
    if (loading) {
      return (
        <>
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} shape="card" height={90} style={styles.skeletonCard} />
          ))}
        </>
      );
    }
    if (error) {
      return <EmptyState icon="alert-circle" title="Impossible de charger les pénalités" description={error} actionLabel="Réessayer" onAction={load} />;
    }
    if (penalites.length === 0) {
      return (
        <EmptyState
          icon="check-circle"
          title="Aucune pénalité"
          description={filter === 'impayees' ? 'Aucune pénalité impayée pour le moment.' : 'Aucune pénalité à afficher.'}
        />
      );
    }
    return penalites.map((p) => {
      const cfg = statutConfig(p);
      return (
        <View key={p.id} style={styles.card}>
          <View style={styles.cardTop}>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardName}>{isAdmin ? memberName(p.user_id) : 'Votre pénalité'}</Text>
              <Text style={styles.cardType}>{typeLabel(p.type_penalite)}</Text>
            </View>
            <AmountText value={p.montant_due} sign="negative" size={16} />
          </View>
          <View style={styles.cardBottom}>
            <StatusBadge label={cfg.label} tone={cfg.tone} />
            <Text style={styles.cardDate}>{formatDate(p.date_attribution_penalite)}</Text>
          </View>
          {p.motif ? <Text style={styles.cardMotif}>{p.motif}</Text> : null}
          {isAdmin && !p.est_reglee ? (
            <View style={styles.cardActions}>
              <AnimatedPressable
                style={styles.actionBtn}
                onPress={() => setActionTarget({ penalite: p, action: 'regler' })}
              >
                <Feather name="check" size={16} color={Colors.success} />
                <Text style={[styles.actionBtnText, { color: Colors.success }]}>Marquer réglée</Text>
              </AnimatedPressable>
              <AnimatedPressable
                style={styles.actionBtn}
                onPress={() => setActionTarget({ penalite: p, action: 'annuler' })}
              >
                <Feather name="x" size={16} color={Colors.danger} />
                <Text style={[styles.actionBtnText, { color: Colors.danger }]}>Annuler</Text>
              </AnimatedPressable>
            </View>
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
          <Text style={styles.headerTitle}>Pénalités</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {tontineNom}
          </Text>
        </View>
        <View style={styles.backButton} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.totalCard}>
          <Text style={styles.totalLabel}>Total impayé</Text>
          <AmountText value={totalImpaye} sign="negative" size={28} />
        </View>

        <View style={styles.filterRow}>
          {FILTERS.map(({ value, label }) => (
            <AnimatedPressable
              key={value}
              style={[styles.filterPill, filter === value && styles.filterPillActive]}
              onPress={() => setFilter(value)}
            >
              <Text style={[styles.filterPillText, filter === value && styles.filterPillTextActive]}>{label}</Text>
            </AnimatedPressable>
          ))}
        </View>

        {isAdmin ? (
          <AnimatedPressable style={styles.attributeButton} onPress={openAttributeForm}>
            <Feather name="plus-circle" size={18} color={Colors.white} />
            <Text style={styles.attributeButtonText}>Attribuer une pénalité</Text>
          </AnimatedPressable>
        ) : null}

        {renderList()}

        <View style={{ height: 32 }} />
      </ScrollView>

      <ConfirmSheet
        visible={actionTarget !== null}
        title={actionTarget?.action === 'regler' ? 'Marquer cette pénalité comme réglée ?' : 'Annuler cette pénalité ?'}
        description={
          actionTarget
            ? actionTarget.action === 'regler'
              ? 'Le membre ne devra plus rien pour cette pénalité.'
              : 'Cette pénalité sera annulée et retirée du total impayé, sans être supprimée de l’historique.'
            : ''
        }
        confirmLabel={actionTarget?.action === 'regler' ? 'Marquer réglée' : 'Annuler la pénalité'}
        confirmVariant={actionTarget?.action === 'regler' ? 'primary' : 'danger'}
        loading={actionLoading}
        onConfirm={confirmAction}
        onCancel={() => setActionTarget(null)}
      />

      <Modal visible={attributeOpen} animationType="slide" transparent onRequestClose={() => setAttributeOpen(false)}>
        <View style={styles.modalOverlay}>
          <SafeAreaView style={styles.modalSheet} edges={['bottom']}>
            <View style={styles.modalHandle} />
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>Attribuer une pénalité</Text>

              <Text style={styles.label}>Membre</Text>
              {membersLoading ? (
                <Skeleton shape="card" height={48} style={{ marginBottom: 16 }} />
              ) : (
                <View style={styles.memberList}>
                  {members
                    .filter((m) => !m.is_hote)
                    .map((m) => {
                      const active = selectedUserId === m.user_id;
                      return (
                        <AnimatedPressable
                          key={m.id}
                          style={[styles.memberChip, active && styles.memberChipActive]}
                          onPress={() => setSelectedUserId(m.user_id)}
                        >
                          <Text style={[styles.memberChipText, active && styles.memberChipTextActive]}>{m.name}</Text>
                        </AnimatedPressable>
                      );
                    })}
                </View>
              )}

              <Text style={styles.label}>Type de pénalité</Text>
              <View style={styles.toggleRow}>
                {PENALITE_TYPES.map(({ value, label }) => (
                  <AnimatedPressable
                    key={value}
                    style={[styles.togglePill, selectedType === value && styles.togglePillActive]}
                    onPress={() => setSelectedType(value)}
                  >
                    <Text style={[styles.togglePillText, selectedType === value && styles.togglePillTextActive]}>{label}</Text>
                  </AnimatedPressable>
                ))}
              </View>

              <Text style={styles.label}>Motif (optionnel)</Text>
              <TextInput
                value={motif}
                onChangeText={setMotif}
                placeholder="Ex. : retard de 5 jours"
                placeholderTextColor={Colors.gray[400]}
                style={styles.textarea}
                multiline
                numberOfLines={2}
                textAlignVertical="top"
              />

              <AnimatedPressable
                style={[styles.saveButton, (attributing || selectedUserId === null) && styles.saveButtonDisabled]}
                onPress={submitAttribution}
                disabled={attributing || selectedUserId === null}
              >
                <Text style={styles.saveButtonText}>{attributing ? 'Attribution…' : 'Attribuer'}</Text>
              </AnimatedPressable>
              <AnimatedPressable style={styles.cancelButton} onPress={() => setAttributeOpen(false)} disabled={attributing}>
                <Text style={styles.cancelButtonText}>Annuler</Text>
              </AnimatedPressable>
              <View style={{ height: 24 }} />
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
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
  totalCard: {
    marginHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.lg,
    padding: Theme.spacing.lg,
    borderRadius: Theme.radius.lg,
    backgroundColor: withOpacity(Colors.danger, 0.06),
    borderWidth: 1,
    borderColor: withOpacity(Colors.danger, 0.15),
  },
  totalLabel: { fontFamily: Fonts.outfit.regular, fontSize: 13, color: Colors.gray[600], marginBottom: 4 },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: Theme.spacing.page, marginBottom: Theme.spacing.lg },
  filterPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: Theme.radius.pill,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Theme.screen.surface,
  },
  filterPillActive: { backgroundColor: Colors.brand, borderColor: Colors.brand },
  filterPillText: { fontFamily: Fonts.outfit.medium, fontSize: 13, color: Colors.gray[700] },
  filterPillTextActive: { color: Colors.white },
  attributeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.lg,
    backgroundColor: Colors.brand,
    paddingVertical: 14,
    borderRadius: Theme.radius.md,
  },
  attributeButtonText: { fontFamily: Fonts.outfit.medium, fontSize: 15, color: Colors.white },
  skeletonCard: { marginHorizontal: Theme.spacing.page, marginBottom: 10, borderRadius: Theme.radius.lg },
  card: {
    marginHorizontal: Theme.spacing.page,
    marginBottom: 10,
    padding: 14,
    borderRadius: Theme.radius.lg,
    backgroundColor: Theme.screen.surface,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    ...Theme.shadow.soft,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 },
  cardName: { fontFamily: Fonts.outfit.medium, fontSize: 15, color: Colors.gray[900] },
  cardType: { fontFamily: Fonts.outfit.regular, fontSize: 13, color: Colors.gray[500], marginTop: 2 },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardDate: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500] },
  cardMotif: { fontFamily: Fonts.outfit.regular, fontSize: 13, color: Colors.gray[600], marginTop: 8, lineHeight: 18 },
  cardActions: { flexDirection: 'row', gap: 12, marginTop: 12 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  actionBtnText: { fontFamily: Fonts.outfit.medium, fontSize: 13 },
  modalOverlay: { flex: 1, backgroundColor: withOpacity(Colors.black, 0.4), justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: Theme.radius.xl,
    borderTopRightRadius: Theme.radius.xl,
    padding: Theme.spacing.xl,
    maxHeight: '85%',
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.gray[200],
    alignSelf: 'center',
    marginBottom: Theme.spacing.lg,
  },
  modalTitle: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 20, color: Colors.gray[900], marginBottom: Theme.spacing.lg },
  label: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.gray[700], marginBottom: 8 },
  memberList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Theme.spacing.lg },
  memberChip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: Theme.radius.pill,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Theme.screen.surface,
  },
  memberChipActive: { backgroundColor: Colors.brand, borderColor: Colors.brand },
  memberChipText: { fontFamily: Fonts.outfit.medium, fontSize: 13, color: Colors.gray[700] },
  memberChipTextActive: { color: Colors.white },
  toggleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: Theme.spacing.lg },
  togglePill: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: Theme.radius.pill,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Theme.screen.surface,
  },
  togglePillActive: { backgroundColor: Colors.brand, borderColor: Colors.brand },
  togglePillText: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.gray[700] },
  togglePillTextActive: { color: Colors.white },
  textarea: {
    minHeight: 72,
    backgroundColor: Theme.screen.bg,
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: Fonts.outfit.regular,
    fontSize: 15,
    color: Colors.gray[900],
    marginBottom: Theme.spacing.lg,
  },
  saveButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.brand,
    paddingVertical: 16,
    borderRadius: Theme.radius.lg,
    marginBottom: Theme.spacing.sm,
  },
  saveButtonDisabled: { opacity: 0.5 },
  saveButtonText: { fontFamily: Fonts.outfit.medium, fontSize: 16, color: Colors.white },
  cancelButton: { alignItems: 'center', justifyContent: 'center', paddingVertical: 14 },
  cancelButtonText: { fontFamily: Fonts.outfit.medium, fontSize: 15, color: Colors.gray[600] },
});
