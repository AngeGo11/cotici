import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/constants/Colors';
import { Fonts } from '@/constants/Fonts';
import { Theme } from '@/constants/Theme';

const categories = ['Religion', 'Éducation', 'Santé', 'Infrastructure', 'Sport', 'Culture'] as const;

export default function CreateAssociationFundScreen() {
  const router = useRouter();
  const [fundName, setFundName] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<string | null>(null);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.85}>
            <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
          </TouchableOpacity>
        </View>

        <View style={styles.heroBlock}>
          <View style={styles.heroIconWrap}>
            <Feather name="home" size={28} color={Colors.success} />
          </View>
          <Text style={styles.heroTitle}>Cagnotte association</Text>
          <Text style={styles.heroSubtitle}>
            Lancez une collecte pour une cause commune : les membres voient l&apos;objectif et la description du projet.
          </Text>
        </View>

        <Text style={styles.sectionEyebrow}>La collecte</Text>

        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Nom de la cagnotte</Text>
          <TextInput
            style={styles.input}
            value={fundName}
            onChangeText={setFundName}
            placeholder="Ex. : construction mosquée du village"
            placeholderTextColor={Colors.gray[400]}
          />
        </View>

        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Objectif de collecte</Text>
          <View style={styles.inputWithUnit}>
            <TextInput
              style={styles.inputField}
              value={targetAmount}
              onChangeText={setTargetAmount}
              placeholder="5 000 000"
              placeholderTextColor={Colors.gray[400]}
              keyboardType="number-pad"
            />
            <Text style={styles.unit}>FCFA</Text>
          </View>
        </View>

        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Description du projet</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={description}
            onChangeText={setDescription}
            placeholder="Décrivez la cause et l'utilisation prévue des fonds…"
            placeholderTextColor={Colors.gray[400]}
            multiline
            textAlignVertical="top"
          />
        </View>

        <Text style={styles.sectionEyebrow}>Catégorie</Text>
        <View style={styles.categoryGrid}>
          {categories.map((c) => {
            const selected = category === c;
            return (
              <TouchableOpacity
                key={c}
                style={[styles.categoryChip, selected && styles.categoryChipActive]}
                onPress={() => setCategory(c)}
                activeOpacity={0.85}
              >
                <Text style={[styles.categoryText, selected && styles.categoryTextActive]}>{c}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {targetAmount ? (
          <View style={styles.previewCard}>
            <View style={styles.previewRow}>
              <View>
                <Text style={styles.previewLabel}>Objectif affiché</Text>
                <Text style={styles.previewValue}>{Number(targetAmount).toLocaleString('fr-FR')} F</Text>
              </View>
              <View style={styles.previewIcon}>
                <Feather name="target" size={24} color={Colors.success} />
              </View>
            </View>
            <Text style={styles.previewSub}>La collecte sera visible par les membres autorisés</Text>
          </View>
        ) : null}

        <TouchableOpacity
          style={styles.createButton}
          onPress={() => router.push({ pathname: '/success', params: { type: 'create-fund' } })}
          activeOpacity={0.9}
        >
          <Feather name="plus-circle" size={20} color={Colors.white} />
          <Text style={styles.createButtonText}>Créer la cagnotte</Text>
        </TouchableOpacity>
        <Text style={styles.footerNote}>Vous pourrez partager le lien de collecte après la création.</Text>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.screen.bg },
  scroll: { paddingBottom: 100 },
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
  heroBlock: {
    paddingHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.xl,
    alignItems: 'center',
  },
  heroIconWrap: {
    width: 72,
    height: 72,
    borderRadius: Theme.radius.lg,
    backgroundColor: withOpacity(Colors.success, 0.14),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Theme.spacing.lg,
  },
  heroTitle: {
    fontFamily: Fonts.spaceGrotesk.bold,
    fontSize: 28,
    color: Colors.gray[900],
    marginBottom: 8,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 15,
    color: Colors.gray[600],
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: Theme.spacing.sm,
  },
  sectionEyebrow: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 13,
    color: Colors.gray[500],
    paddingHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.md,
    letterSpacing: 0.2,
  },
  fieldBlock: { marginBottom: Theme.spacing.lg },
  label: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 14,
    color: Colors.gray[700],
    paddingHorizontal: Theme.spacing.page,
    marginBottom: 8,
  },
  input: {
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Theme.screen.surface,
    borderRadius: Theme.radius.md,
    paddingHorizontal: Theme.spacing.lg,
    paddingVertical: Theme.spacing.md + 2,
    fontFamily: Fonts.outfit.regular,
    fontSize: 16,
    color: Colors.gray[900],
    borderWidth: 1,
    borderColor: Colors.gray[100],
    ...Theme.shadow.soft,
  },
  inputMultiline: {
    minHeight: 120,
    paddingTop: Theme.spacing.md + 2,
  },
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
  inputField: {
    flex: 1,
    paddingHorizontal: Theme.spacing.lg,
    paddingVertical: Theme.spacing.md + 2,
    fontFamily: Fonts.outfit.regular,
    fontSize: 16,
    color: Colors.gray[900],
  },
  unit: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[500], paddingRight: Theme.spacing.lg },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Theme.spacing.sm,
    paddingHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.xl,
  },
  categoryChip: {
    backgroundColor: Theme.screen.surface,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    borderRadius: Theme.radius.md,
    paddingVertical: Theme.spacing.md,
    paddingHorizontal: Theme.spacing.lg,
    width: '48%',
    alignItems: 'center',
    ...Theme.shadow.soft,
  },
  categoryChipActive: {
    borderColor: withOpacity(Colors.success, 0.45),
    backgroundColor: withOpacity(Colors.success, 0.08),
  },
  categoryText: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.gray[700] },
  categoryTextActive: { color: Colors.success },
  previewCard: {
    marginHorizontal: Theme.spacing.page,
    backgroundColor: withOpacity(Colors.success, 0.08),
    borderRadius: Theme.radius.xl,
    padding: Theme.spacing.xl,
    marginBottom: Theme.spacing.xl,
    borderWidth: 1,
    borderColor: withOpacity(Colors.success, 0.22),
    ...Theme.shadow.soft,
  },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  previewLabel: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[600], marginBottom: 4 },
  previewValue: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 26, color: Colors.success },
  previewIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: withOpacity(Colors.success, 0.14),
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewSub: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[600], lineHeight: 20 },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Colors.success,
    paddingVertical: Theme.spacing.lg,
    borderRadius: Theme.radius.md,
    ...Theme.shadow.soft,
  },
  createButtonText: { fontFamily: Fonts.outfit.medium, fontSize: 17, color: Colors.white },
  footerNote: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 12,
    color: Colors.gray[500],
    textAlign: 'center',
    marginTop: Theme.spacing.md,
    paddingHorizontal: Theme.spacing.xl,
    lineHeight: 18,
  },
});
