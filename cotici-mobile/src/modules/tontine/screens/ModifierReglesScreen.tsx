import { useEffect, useMemo, useState } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { AnimatedPressable, InfoBanner } from '@/shared/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';
import { modifierRegles } from '@/shared/api';
import { useTontineDetail } from '@/modules/tontine/hooks/useTontineDetail';

// Les valeurs doivent correspondre exactement à `TontineRegle.FREQUENCE_COTISATION`
// (cotici-backend/apps/tontine/models.py) — l'écran les renvoie telles quelles.
const FREQUENCE_OPTIONS = [
  { value: 'JOURNALIER', label: 'Journalier' },
  { value: 'HEBDOMADAIRE', label: 'Hebdo.' },
  { value: 'MENSUEL', label: 'Mensuel' },
  { value: 'PERSONNALISÉE', label: 'Personnalisée' },
] as const;

const ORDRE_OPTIONS = [
  { value: "DÉFINI PAR L'ADMIN", label: "Défini par l'admin" },
  { value: 'ALÉATOIRE', label: 'Aléatoire' },
] as const;

const DEFAULT_NOM = 'ce groupe';

export default function ModifierReglesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; tontineNom?: string }>();
  const tontineId = typeof params.id === 'string' ? params.id : undefined;
  const tontineNom = useMemo(
    () => (typeof params.tontineNom === 'string' && params.tontineNom ? params.tontineNom : DEFAULT_NOM),
    [params.tontineNom],
  );
  const { detail, loading, error } = useTontineDetail(tontineId);

  const [montantCotisation, setMontantCotisation] = useState('');
  const [nombreMax, setNombreMax] = useState('');
  const [frequence, setFrequence] = useState<string>('MENSUEL');
  const [frequencePersonnalise, setFrequencePersonnalise] = useState('');
  const [ordreRamassage, setOrdreRamassage] = useState<string>('ALÉATOIRE');
  const [montantPenalite, setMontantPenalite] = useState('');
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initialized || !detail?.regles) return;
    const regle = detail.regles;
    setMontantCotisation(String(Math.round(Number(regle.montant_cotisation))));
    setNombreMax(String(regle.nombre_max));
    setFrequence(regle.frequence);
    setFrequencePersonnalise(regle.frequence_personnalise ? String(regle.frequence_personnalise) : '');
    setOrdreRamassage(regle.ordre_ramassage);
    setMontantPenalite(String(Math.round(Number(regle.montant_penalite))));
    setInitialized(true);
  }, [detail, initialized]);

  const cycleDemarre = Boolean(detail && (detail.phase === 'active' || detail.phase === 'completed'));
  const ordrePublie = detail?.ordre_publie ?? false;

  const financialFieldsChanged = useMemo(() => {
    if (!detail?.regles) return false;
    const regle = detail.regles;
    return (
      String(Math.round(Number(regle.montant_cotisation))) !== montantCotisation ||
      String(regle.nombre_max) !== nombreMax ||
      regle.frequence !== frequence ||
      (regle.frequence_personnalise ? String(regle.frequence_personnalise) : '') !== frequencePersonnalise ||
      regle.ordre_ramassage !== ordreRamassage
    );
  }, [detail, montantCotisation, nombreMax, frequence, frequencePersonnalise, ordreRamassage]);

  const save = () => {
    if (!detail?.regles || !tontineId) return;
    const regle = detail.regles;
    const payload: Record<string, number | string> = {};

    if (!cycleDemarre) {
      if (String(Math.round(Number(regle.montant_cotisation))) !== montantCotisation) {
        const value = parseInt(montantCotisation, 10);
        if (!Number.isFinite(value) || value <= 0) {
          Alert.alert('Montant invalide', 'Le montant de la cotisation doit être un nombre positif.');
          return;
        }
        payload.montant_cotisation = value;
      }
      if (String(regle.nombre_max) !== nombreMax) {
        const value = parseInt(nombreMax, 10);
        if (!Number.isFinite(value) || value < 2) {
          Alert.alert('Valeur invalide', 'Le nombre maximum de participants doit être d’au moins 2.');
          return;
        }
        payload.nombre_max = value;
      }
      if (regle.frequence !== frequence) {
        payload.frequence = frequence;
      }
      const personnaliseChanged =
        (regle.frequence_personnalise ? String(regle.frequence_personnalise) : '') !== frequencePersonnalise;
      if (frequence === 'PERSONNALISÉE') {
        const value = parseInt(frequencePersonnalise, 10);
        if (!Number.isFinite(value) || value <= 0) {
          Alert.alert('Valeur invalide', 'Précisez le nombre de jours pour la fréquence personnalisée.');
          return;
        }
        if (personnaliseChanged || regle.frequence !== frequence) {
          payload.frequence_personnalise = value;
        }
      }
      if (regle.ordre_ramassage !== ordreRamassage) {
        payload.ordre_ramassage = ordreRamassage;
      }
    }

    if (String(Math.round(Number(regle.montant_penalite))) !== montantPenalite) {
      const value = parseInt(montantPenalite, 10);
      if (!Number.isFinite(value) || value < 0) {
        Alert.alert('Valeur invalide', 'Le montant de la pénalité doit être positif ou nul.');
        return;
      }
      payload.montant_penalite = value;
    }

    if (Object.keys(payload).length === 0) {
      router.back();
      return;
    }

    const hasFinancialChange = Object.keys(payload).some((k) => k !== 'montant_penalite');

    const doSave = () => {
      void (async () => {
        setSaving(true);
        const result = await modifierRegles({ tontine_id: Number(tontineId), ...payload });
        setSaving(false);
        if (!result.ok) {
          const lockedMsg =
            result.champs_verrouilles && result.champs_verrouilles.length > 0
              ? `\n\nChamps verrouillés : ${result.champs_verrouilles.join(', ')}`
              : '';
          Alert.alert('Erreur', `${result.detail}${lockedMsg}`);
          return;
        }
        router.back();
      })();
    };

    if (hasFinancialChange) {
      Alert.alert(
        'Confirmer les modifications',
        'Ces changements sont significatifs : tous les membres actifs (hors hôte) devront ré-accepter les règles avant de continuer à participer.',
        [
          { text: 'Annuler', style: 'cancel' },
          { text: 'Confirmer', onPress: doSave },
        ],
      );
    } else {
      doSave();
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.brand} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !detail || !detail.regles) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <AnimatedPressable style={styles.backButton} onPress={() => router.back()}>
            <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
          </AnimatedPressable>
        </View>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error ?? 'Règles introuvables pour cette tontine.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <AnimatedPressable style={styles.backButton} onPress={() => router.back()}>
            <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
          </AnimatedPressable>
        </View>

        <View style={styles.heroBlock}>
          <View style={styles.heroIconWrap}>
            <Feather name="settings" size={28} color={Colors.brand} />
          </View>
          <Text style={styles.heroTitle}>Modifier les règles</Text>
          <Text style={styles.heroSubtitle}>{tontineNom}</Text>
        </View>

        {cycleDemarre ? (
          <InfoBanner
            icon="lock"
            tone="neutral"
            text="Le cycle de cotisation a déjà démarré : seul le montant de la pénalité peut encore être modifié. Les autres règles sont verrouillées pour préserver l'équilibre financier du cycle en cours."
          />
        ) : null}

        {!cycleDemarre && ordrePublie ? (
          <InfoBanner
            icon="lock"
            tone="warning"
            text="L'ordre de ramassage a été publié et ne peut plus être modifié depuis ce formulaire."
          />
        ) : null}

        <Text style={styles.sectionEyebrow}>Cotisation & calendrier</Text>

        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Montant de la mise</Text>
          <View style={[styles.inputWithUnit, cycleDemarre && styles.inputDisabled]}>
            <TextInput
              style={styles.inputField}
              value={montantCotisation}
              onChangeText={setMontantCotisation}
              placeholder="0"
              placeholderTextColor={Colors.gray[400]}
              keyboardType="number-pad"
              editable={!cycleDemarre}
            />
            <Text style={styles.unit}>FCFA</Text>
          </View>
        </View>

        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Nombre maximum de participants</Text>
          <View style={[styles.inputWithUnit, cycleDemarre && styles.inputDisabled]}>
            <TextInput
              style={styles.inputField}
              value={nombreMax}
              onChangeText={setNombreMax}
              placeholder="0"
              placeholderTextColor={Colors.gray[400]}
              keyboardType="number-pad"
              editable={!cycleDemarre}
            />
            <Text style={styles.unit}>membres</Text>
          </View>
        </View>

        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Fréquence</Text>
          <View style={styles.toggleRow}>
            {FREQUENCE_OPTIONS.map(({ value, label }) => (
              <AnimatedPressable
                key={value}
                style={[styles.togglePill, frequence === value && styles.togglePillActive, cycleDemarre && styles.pillDisabled]}
                onPress={() => !cycleDemarre && setFrequence(value)}
                disabled={cycleDemarre}
              >
                <Text style={[styles.togglePillText, frequence === value && styles.togglePillTextActive]}>{label}</Text>
              </AnimatedPressable>
            ))}
          </View>
        </View>

        {frequence === 'PERSONNALISÉE' ? (
          <View style={styles.fieldBlock}>
            <Text style={styles.label}>Intervalle personnalisé</Text>
            <View style={[styles.inputWithUnit, cycleDemarre && styles.inputDisabled]}>
              <TextInput
                style={styles.inputField}
                value={frequencePersonnalise}
                onChangeText={setFrequencePersonnalise}
                placeholder="Ex. : 10"
                placeholderTextColor={Colors.gray[400]}
                keyboardType="number-pad"
                editable={!cycleDemarre}
              />
              <Text style={styles.unit}>jours</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Ordre de ramassage</Text>
          <View style={styles.toggleRow}>
            {ORDRE_OPTIONS.map(({ value, label }) => (
              <AnimatedPressable
                key={value}
                style={[
                  styles.togglePill,
                  ordreRamassage === value && styles.togglePillActive,
                  (cycleDemarre || ordrePublie) && styles.pillDisabled,
                ]}
                onPress={() => !cycleDemarre && !ordrePublie && setOrdreRamassage(value)}
                disabled={cycleDemarre || ordrePublie}
              >
                <Text style={[styles.togglePillText, ordreRamassage === value && styles.togglePillTextActive]}>{label}</Text>
              </AnimatedPressable>
            ))}
          </View>
        </View>

        <Text style={styles.sectionEyebrow}>Pénalités</Text>

        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Montant de la pénalité (0 = désactivées)</Text>
          <View style={styles.inputWithUnit}>
            <TextInput
              style={styles.inputField}
              value={montantPenalite}
              onChangeText={setMontantPenalite}
              keyboardType="number-pad"
              placeholder="0"
              placeholderTextColor={Colors.gray[400]}
            />
            <Text style={styles.unit}>FCFA</Text>
          </View>
        </View>

        {financialFieldsChanged && !cycleDemarre ? (
          <InfoBanner
            icon="alert-triangle"
            tone="warning"
            text="Ces changements financiers réinitialiseront l'acceptation des règles des membres actifs (hors hôte), qui devront les ré-accepter."
          />
        ) : null}

        <AnimatedPressable style={[styles.saveButton, saving && styles.saveButtonDisabled]} onPress={save} disabled={saving}>
          {saving ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <>
              <Feather name="check" size={20} color={Colors.white} />
              <Text style={styles.saveText}>Enregistrer les modifications</Text>
            </>
          )}
        </AnimatedPressable>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.screen.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Theme.spacing.page },
  errorText: { fontFamily: Fonts.outfit.regular, fontSize: 15, color: Colors.gray[600], textAlign: 'center' },
  scroll: { paddingBottom: 32 },
  header: { paddingHorizontal: Theme.spacing.page, paddingVertical: Theme.spacing.sm },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Theme.screen.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...Theme.shadow.soft,
  },
  heroBlock: { paddingHorizontal: Theme.spacing.page, marginBottom: Theme.spacing.lg, alignItems: 'center' },
  heroIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: withOpacity(Colors.brand, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Theme.spacing.md,
  },
  heroTitle: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 24, color: Colors.gray[900], marginBottom: 4, textAlign: 'center' },
  heroSubtitle: { fontFamily: Fonts.outfit.medium, fontSize: 16, color: Colors.brand, marginBottom: 8, textAlign: 'center' },
  sectionEyebrow: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 13,
    color: Colors.gray[500],
    paddingHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.md,
  },
  fieldBlock: { marginBottom: Theme.spacing.lg },
  label: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.gray[700], paddingHorizontal: Theme.spacing.page, marginBottom: 8 },
  inputWithUnit: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Theme.screen.surface,
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    ...Theme.shadow.soft,
  },
  inputDisabled: { opacity: 0.5 },
  inputField: {
    flex: 1,
    paddingHorizontal: Theme.spacing.lg,
    paddingVertical: Theme.spacing.md + 2,
    fontFamily: Fonts.outfit.regular,
    fontSize: 16,
    color: Colors.gray[900],
  },
  unit: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[500], paddingRight: Theme.spacing.lg },
  toggleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: Theme.spacing.page },
  togglePill: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: Theme.radius.pill,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    backgroundColor: Theme.screen.surface,
  },
  togglePillActive: { backgroundColor: Colors.brand, borderColor: Colors.brand },
  pillDisabled: { opacity: 0.5 },
  togglePillText: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.gray[700] },
  togglePillTextActive: { color: Colors.white },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Colors.brand,
    paddingVertical: 16,
    borderRadius: Theme.radius.lg,
    marginTop: Theme.spacing.md,
  },
  saveButtonDisabled: { opacity: 0.7 },
  saveText: { fontFamily: Fonts.outfit.medium, fontSize: 16, color: Colors.white },
});
