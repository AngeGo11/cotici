import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/constants/Colors';
import { Fonts } from '@/constants/Fonts';
import { Theme } from '@/constants/Theme';

const categories = ['Voyage', 'Projet', 'Mariage', 'Éducation', 'Santé', 'Autre'];

/** Valeurs initiales alignées sur l’objectif « Nouveau Projet » (écran détail) */
const INITIAL = {
  goalName: 'Nouveau Projet',
  targetAmount: '500000',
  duration: '6',
  category: 'Projet',
};

export default function ModifierObjectifScreen() {
  const router = useRouter();
  const [goalName, setGoalName] = useState(INITIAL.goalName);
  const [targetAmount, setTargetAmount] = useState(INITIAL.targetAmount);
  const [duration, setDuration] = useState(INITIAL.duration);
  const [category, setCategory] = useState(INITIAL.category);

  const monthlyAmount =
    targetAmount && duration
      ? Math.ceil(Number(targetAmount.replace(/\s/g, '')) / Number(duration))
      : 0;

  const canSave =
    goalName.trim().length > 0 &&
    Number(targetAmount.replace(/\s/g, '')) > 0 &&
    Number(duration) > 0;

  const onSave = () => {
    if (!canSave) return;
    router.back();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
          </TouchableOpacity>
        </View>

        <View style={styles.titleRow}>
          <View style={styles.titleIcon}>
            <Feather name="edit-2" size={24} color={Colors.success} />
          </View>
          <View>
            <Text style={styles.title}>Modifier l'objectif</Text>
            <Text style={styles.subtitle}>Ajustez le nom, le montant ou la durée</Text>
          </View>
        </View>

        <Text style={styles.label}>Nom de l'objectif</Text>
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
            <TouchableOpacity
              key={c}
              style={[styles.categoryChip, category === c && styles.categoryChipActive]}
              onPress={() => setCategory(c)}
            >
              <Text style={[styles.categoryText, category === c && styles.categoryTextActive]}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>

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
              Pour atteindre {Number(targetAmount.replace(/\s/g, '')).toLocaleString('fr-FR')} F en{' '}
              {duration} mois
            </Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={[styles.saveButton, !canSave && styles.saveButtonDisabled]}
          onPress={onSave}
          disabled={!canSave}
        >
          <Text style={[styles.saveButtonText, !canSave && { color: Colors.gray[400] }]}>
            Enregistrer les modifications
          </Text>
        </TouchableOpacity>

        <Text style={styles.footerNote}>Les montants déjà épargnés ne sont pas modifiés</Text>
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.screen.bg },
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
