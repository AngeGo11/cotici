import { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { AnimatedPressable } from '@/shared/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { updateSavingsGoal } from '@/shared/api';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';
import { useSavingsDetail } from '@/modules/savings/hooks/useSavingsDetail';

const categories = ['Voyage', 'Projet personnel', 'Mariage', 'Éducation', 'Santé', 'Autre'] as const;
type Category = (typeof categories)[number];

function parsePositiveInt(value: string): number | null {
  const n = Number(value.replace(/\s/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

function categoryFromDetail(raw: string): { category: Category; otherCategory: string } {
  if ((categories as readonly string[]).includes(raw)) {
    return { category: raw as Category, otherCategory: '' };
  }
  if (raw) {
    return { category: 'Autre', otherCategory: raw };
  }
  return { category: 'Projet personnel', otherCategory: '' };
}

export default function ModifierObjectifScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { detail, loading, error: loadError } = useSavingsDetail(id);

  const [goalName, setGoalName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [duration, setDuration] = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  const [otherCategory, setOtherCategory] = useState('');
  const [formReady, setFormReady] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    setFormReady(false);
  }, [id]);

  useEffect(() => {
    if (!detail || formReady) return;
    const mapped = categoryFromDetail(detail.category);
    setGoalName(detail.name);
    setTargetAmount(String(detail.target));
    setDuration(String(detail.durationMonths));
    setCategory(mapped.category);
    setOtherCategory(mapped.otherCategory);
    setFormReady(true);
  }, [detail, formReady]);

  const montantCible = parsePositiveInt(targetAmount);
  const dureeMois = parsePositiveInt(duration);
  const monthlyAmount =
    montantCible && dureeMois ? Math.ceil(montantCible / dureeMois) : 0;

  const canSave =
    Boolean(goalName.trim()) &&
    montantCible !== null &&
    dureeMois !== null &&
    category !== null &&
    (category !== 'Autre' || Boolean(otherCategory.trim())) &&
    (detail === null || montantCible >= detail.saved) &&
    !isSubmitting &&
    formReady;

  const onSave = async () => {
    if (!canSave || !category || !id || montantCible === null || dureeMois === null) return;

    setIsSubmitting(true);
    setErrorMessage('');

    const result = await updateSavingsGoal({
      id,
      nom_projet: goalName.trim(),
      montant_cible: montantCible,
      duree: dureeMois,
      categorie: category,
      ...(category === 'Autre' ? { value_categorie: otherCategory.trim() } : {}),
    });

    if (!result.ok) {
      setErrorMessage(result.detail);
      setIsSubmitting(false);
      return;
    }

    setIsSubmitting(false);
    router.back();
  };

  if (loading || !formReady) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.brand} />
        </View>
      </SafeAreaView>
    );
  }

  if (loadError || !detail) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <AnimatedPressable style={styles.backButton} onPress={() => router.back()}>
            <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
          </AnimatedPressable>
        </View>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{loadError ?? 'Objectif introuvable.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <AnimatedPressable style={styles.backButton} onPress={() => router.back()}>
            <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
          </AnimatedPressable>
        </View>

        <View style={styles.titleRow}>
          <View style={styles.titleIcon}>
            <Feather name="edit-2" size={24} color={Colors.success} />
          </View>
          <View>
            <Text style={styles.title}>Modifier l&apos;objectif</Text>
            <Text style={styles.subtitle}>Ajustez le nom, le montant ou la durée</Text>
          </View>
        </View>

        <Text style={styles.label}>Nom de l&apos;objectif</Text>
        <TextInput
          style={styles.input}
          value={goalName}
          onChangeText={setGoalName}
          placeholder="Ex: Nouveau Projet, Vacances..."
          placeholderTextColor={Colors.gray[400]}
        />

        <Text style={styles.label}>Montant à atteindre</Text>
        <View style={styles.inputWithUnit}>
          <TextInput
            style={styles.inputField}
            value={targetAmount}
            onChangeText={setTargetAmount}
            placeholder="500000"
            placeholderTextColor={Colors.gray[400]}
            keyboardType="number-pad"
          />
          <Text style={styles.unit}>FCFA</Text>
        </View>
        {detail.saved > 0 && montantCible !== null && montantCible < detail.saved ? (
          <Text style={styles.fieldHint}>
            Minimum : {detail.saved.toLocaleString('fr-FR')} F (déjà épargné)
          </Text>
        ) : null}

        <Text style={styles.label}>Durée (en mois)</Text>
        <TextInput
          style={styles.input}
          value={duration}
          onChangeText={setDuration}
          placeholder="6"
          placeholderTextColor={Colors.gray[400]}
          keyboardType="number-pad"
        />

        <Text style={styles.label}>Catégorie</Text>
        <View style={styles.categoryGrid}>
          {categories.map((c) => (
            <AnimatedPressable
              key={c}
              style={[styles.categoryChip, category === c && styles.categoryChipActive]}
              onPress={() => {
                setCategory(c);
                if (c !== 'Autre') setOtherCategory('');
              }}
            >
              <Text style={[styles.categoryText, category === c && styles.categoryTextActive]}>{c}</Text>
            </AnimatedPressable>
          ))}
        </View>

        {category === 'Autre' && (
          <>
            <Text style={styles.label}>Précisez la catégorie</Text>
            <TextInput
              style={styles.input}
              value={otherCategory}
              onChangeText={setOtherCategory}
              placeholder="Ex : Achat véhicule, rénovation…"
              placeholderTextColor={Colors.gray[400]}
            />
          </>
        )}

        {monthlyAmount > 0 ? (
          <View style={styles.previewCard}>
            <View style={styles.previewRow}>
              <View>
                <Text style={styles.previewLabel}>Épargne mensuelle recommandée</Text>
                <Text style={styles.previewValue}>{monthlyAmount.toLocaleString('fr-FR')} F</Text>
              </View>
              <View style={styles.previewIcon}>
                <Feather name="calendar" size={24} color={Colors.success} />
              </View>
            </View>
            <Text style={styles.previewSub}>
              Pour atteindre {montantCible!.toLocaleString('fr-FR')} F en {dureeMois} mois
            </Text>
          </View>
        ) : null}

        {errorMessage ? (
          <View style={styles.errorCard}>
            <Feather name="alert-circle" size={20} color={Colors.accent} />
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        <AnimatedPressable
          style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
          onPress={() => void onSave()}
          disabled={!canSave}
        >
          {isSubmitting ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={[styles.saveButtonText, !canSave && { color: Colors.gray[400] }]}>
              Enregistrer les modifications
            </Text>
          )}
        </AnimatedPressable>

        <Text style={styles.footerNote}>Les montants déjà épargnés ne sont pas modifiés</Text>
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.screen.bg },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: Theme.spacing.page },
  header: { paddingHorizontal: Theme.spacing.page, paddingVertical: 12 },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: Theme.spacing.page, marginBottom: 24 },
  titleIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: withOpacity(Colors.success, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 24, color: Colors.gray[900] },
  subtitle: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[500] },
  label: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    color: Colors.gray[700],
    paddingHorizontal: Theme.spacing.page,
    marginBottom: 8,
  },
  fieldHint: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 12,
    color: Colors.danger,
    paddingHorizontal: Theme.spacing.page,
    marginTop: -8,
    marginBottom: 16,
  },
  input: {
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Colors.gray[50],
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontFamily: Fonts.outfit.regular,
    fontSize: 16,
    color: Colors.gray[900],
    borderWidth: 1,
    borderColor: Colors.gray[100],
    marginBottom: 16,
  },
  inputWithUnit: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Colors.gray[50],
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    marginBottom: 16,
  },
  inputField: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontFamily: Fonts.outfit.regular,
    fontSize: 16,
    color: Colors.gray[900],
  },
  unit: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[500], paddingRight: 16 },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: Theme.spacing.page, marginBottom: 24 },
  categoryChip: {
    backgroundColor: Colors.gray[50],
    borderWidth: 1,
    borderColor: Colors.gray[100],
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    width: '48%',
  },
  categoryChipActive: {
    borderColor: Colors.success,
    backgroundColor: withOpacity(Colors.success, 0.08),
  },
  categoryText: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[700], textAlign: 'center' },
  categoryTextActive: { fontFamily: Fonts.outfit.medium, color: Colors.success },
  previewCard: {
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Theme.screen.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: withOpacity(Colors.success, 0.25),
  },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  previewLabel: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[600], marginBottom: 4 },
  previewValue: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 24, color: Colors.success },
  previewIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: withOpacity(Colors.success, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewSub: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[500] },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Theme.spacing.md,
    marginHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.lg,
    padding: Theme.spacing.lg,
    borderRadius: Theme.radius.lg,
    backgroundColor: withOpacity(Colors.accent, 0.1),
    borderWidth: 1,
    borderColor: withOpacity(Colors.accent, 0.25),
  },
  errorText: {
    flex: 1,
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    color: Colors.gray[700],
    lineHeight: 20,
    textAlign: 'center',
  },
  saveButton: {
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Colors.success,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
  },
  saveButtonDisabled: { backgroundColor: Colors.gray[200] },
  saveButtonText: { fontFamily: Fonts.outfit.medium, fontSize: 16, color: Colors.white },
  footerNote: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 12,
    color: Colors.gray[500],
    textAlign: 'center',
    marginTop: 12,
  },
});
