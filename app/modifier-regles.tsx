import { useState, useMemo } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Switch } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/constants/Colors';
import { Fonts } from '@/constants/Fonts';
import { Theme } from '@/constants/Theme';

const DEFAULT_NOM = 'Tontine Entrepreneurs';

export default function ModifierReglesScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tontineNom?: string }>();
  const tontineNom = useMemo(
    () => (typeof params.tontineNom === 'string' && params.tontineNom ? params.tontineNom : DEFAULT_NOM),
    [params.tontineNom],
  );

  const [monthlyAmount, setMonthlyAmount] = useState('120000');
  const [frequency, setFrequency] = useState<'weekly' | 'monthly' | 'biweekly'>('monthly');
  const [cycleMonths, setCycleMonths] = useState('12');
  const [graceDays, setGraceDays] = useState('3');
  const [penaltiesEnabled, setPenaltiesEnabled] = useState(true);
  const [penaltyAmount, setPenaltyAmount] = useState('5000');
  const [quorum, setQuorum] = useState('50');
  const [note, setNote] = useState('');

  const save = () => {
    router.back();
  };

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
            <Feather name="settings" size={28} color={Colors.brand} />
          </View>
          <Text style={styles.heroTitle}>Modifier les règles</Text>
          <Text style={styles.heroSubtitle}>{tontineNom}</Text>
          <Text style={styles.heroHint}>
            Les changements s’appliqueront au prochain cycle, sauf mention contraire auprès des membres.
          </Text>
        </View>

        <Text style={styles.sectionEyebrow}>Cotisation & calendrier</Text>

        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Montant de la mise</Text>
          <View style={styles.inputWithUnit}>
            <TextInput
              style={styles.inputField}
              value={monthlyAmount}
              onChangeText={setMonthlyAmount}
              placeholder="0"
              placeholderTextColor={Colors.gray[400]}
              keyboardType="number-pad"
            />
            <Text style={styles.unit}>FCFA</Text>
          </View>
        </View>

        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Fréquence</Text>
          <View style={styles.toggleRow}>
            {(
              [
                { key: 'weekly' as const, label: 'Hebdo.' },
                { key: 'biweekly' as const, label: 'Bi-mensuel' },
                { key: 'monthly' as const, label: 'Mensuel' },
              ] as const
            ).map(({ key, label }) => (
              <TouchableOpacity
                key={key}
                style={[styles.togglePill, frequency === key && styles.togglePillActive]}
                onPress={() => setFrequency(key)}
                activeOpacity={0.88}
              >
                <Text style={[styles.togglePillText, frequency === key && styles.togglePillTextActive]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Durée d’un tour de table (mois)</Text>
          <View style={styles.inputWithUnit}>
            <TextInput
              style={styles.inputField}
              value={cycleMonths}
              onChangeText={setCycleMonths}
              placeholder="12"
              placeholderTextColor={Colors.gray[400]}
              keyboardType="number-pad"
            />
            <Text style={styles.unit}>mois</Text>
          </View>
        </View>

        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Délai de grâce (jours) après l’échéance</Text>
          <View style={styles.inputWithUnit}>
            <TextInput
              style={styles.inputField}
              value={graceDays}
              onChangeText={setGraceDays}
              placeholder="0"
              placeholderTextColor={Colors.gray[400]}
              keyboardType="number-pad"
            />
            <Text style={styles.unit}>j</Text>
          </View>
        </View>

        <Text style={styles.sectionEyebrow}>Pénalités & gouvernance</Text>

        <View style={styles.advancedCard}>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchTitle}>Pénalités actives</Text>
              <Text style={styles.switchHint}>En cas de retard de cotisation (hors période de grâce).</Text>
            </View>
            <Switch
              value={penaltiesEnabled}
              onValueChange={setPenaltiesEnabled}
              trackColor={{ false: Colors.gray[200], true: withOpacity(Colors.brand, 0.45) }}
              thumbColor={penaltiesEnabled ? Colors.brand : Colors.gray[400]}
            />
          </View>
          {penaltiesEnabled ? (
            <View style={[styles.fieldBlock, { marginTop: 16, marginBottom: 0 }]}>
              <Text style={styles.label}>Montant de la pénalité</Text>
              <View style={styles.inputWithUnit}>
                <TextInput
                  style={styles.inputField}
                  value={penaltyAmount}
                  onChangeText={setPenaltyAmount}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={Colors.gray[400]}
                />
                <Text style={styles.unit}>FCFA</Text>
              </View>
            </View>
          ) : null}
        </View>

        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Quorum de vote (règles & exclusions)</Text>
          <View style={styles.inputWithUnit}>
            <TextInput
              style={styles.inputField}
              value={quorum}
              onChangeText={setQuorum}
              placeholder="50"
              placeholderTextColor={Colors.gray[400]}
              keyboardType="number-pad"
            />
            <Text style={styles.unit}>% des membres</Text>
          </View>
        </View>

        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Note interne (optionnelle)</Text>
          <TextInput
            style={styles.textarea}
            value={note}
            onChangeText={setNote}
            placeholder="Ex. : ajustement suite à l’assemblée du 10/02/2026"
            placeholderTextColor={Colors.gray[400]}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </View>

        <View style={styles.infoBanner}>
          <Feather name="info" size={20} color={Colors.info} />
          <Text style={styles.infoText}>
            Pensez à informer le groupe (discussion ou notification) des changements importants.
          </Text>
        </View>

        <TouchableOpacity style={styles.saveButton} onPress={save} activeOpacity={0.9}>
          <Feather name="check" size={20} color={Colors.white} />
          <Text style={styles.saveText}>Enregistrer les modifications</Text>
        </TouchableOpacity>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.screen.bg },
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
  heroHint: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[600], textAlign: 'center', lineHeight: 20, paddingHorizontal: 8 },
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
  togglePillText: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.gray[700] },
  togglePillTextActive: { color: Colors.white },
  advancedCard: {
    marginHorizontal: Theme.spacing.page,
    borderRadius: Theme.radius.lg,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    backgroundColor: Theme.screen.surface,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.lg,
    ...Theme.shadow.soft,
  },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchTitle: { fontFamily: Fonts.outfit.medium, fontSize: 15, color: Colors.gray[900], marginBottom: 4 },
  switchHint: { fontFamily: Fonts.outfit.regular, fontSize: 13, color: Colors.gray[600], lineHeight: 18 },
  textarea: {
    marginHorizontal: Theme.spacing.page,
    minHeight: 88,
    backgroundColor: Theme.screen.surface,
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    paddingHorizontal: Theme.spacing.lg,
    paddingVertical: 12,
    fontFamily: Fonts.outfit.regular,
    fontSize: 15,
    color: Colors.gray[900],
  },
  infoBanner: {
    flexDirection: 'row',
    gap: 10,
    marginHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.lg,
    padding: 14,
    borderRadius: Theme.radius.lg,
    backgroundColor: withOpacity(Colors.info, 0.08),
    borderWidth: 1,
    borderColor: withOpacity(Colors.info, 0.2),
  },
  infoText: { flex: 1, fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.info, lineHeight: 20 },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Colors.brand,
    paddingVertical: 16,
    borderRadius: Theme.radius.lg,
  },
  saveText: { fontFamily: Fonts.outfit.medium, fontSize: 16, color: Colors.white },
});
