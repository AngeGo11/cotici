import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';

export default function CreateClassicTontineScreen() {
  const router = useRouter();
  const [groupName, setGroupName] = useState('');
  const [monthlyAmount, setMonthlyAmount] = useState('');
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('monthly');
  const [customFrequencyDays, setCustomFrequencyDays] = useState('');
  const [rotationLogic, setRotationLogic] = useState<'random' | 'admin'>('random');
  const [penaltiesEnabled, setPenaltiesEnabled] = useState(true);
  const [penaltyType, setPenaltyType] = useState<'retard' | 'absence'>('retard');
  const [penaltyAmount, setPenaltyAmount] = useState('2000');

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
            <Feather name="refresh-cw" size={28} color={Colors.brand} />
          </View>
          <Text style={styles.heroTitle}>Tontine de groupe</Text>
          <Text style={styles.heroSubtitle}>
            Cotisez ensemble et définissez les règles de votre collectif avant d&apos;inviter les membres.
          </Text>
        </View>

        <Text style={styles.sectionEyebrow}>Informations de base</Text>

        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Nom du groupe</Text>
          <TextInput
            style={styles.input}
            value={groupName}
            onChangeText={setGroupName}
            placeholder="Ex : Tontine des Entrepreneurs"
            placeholderTextColor={Colors.gray[400]}
          />
        </View>

        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Montant de la mise</Text>
          <View style={styles.inputWithUnit}>
            <TextInput
              style={styles.inputField}
              value={monthlyAmount}
              onChangeText={setMonthlyAmount}
              placeholder="10 000"
              placeholderTextColor={Colors.gray[400]}
              keyboardType="number-pad"
            />
            <Text style={styles.unit}>FCFA</Text>
          </View>
        </View>

        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Fréquence des cotisations</Text>
          <View style={styles.toggleGrid}>
            {(['daily', 'weekly', 'monthly', 'custom'] as const).map((f) => (
              <TouchableOpacity
                key={f}
                style={[styles.toggleButton, frequency === f && styles.toggleActive]}
                onPress={() => setFrequency(f)}
                activeOpacity={0.88}
              >
                <Text style={[styles.toggleText, frequency === f && styles.toggleTextActive]}>
                  {f === 'daily'
                    ? 'Journalière'
                    : f === 'weekly'
                      ? 'Hebdomadaire'
                      : f === 'monthly'
                        ? 'Mensuelle'
                        : 'Personnalisée'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {frequency === 'custom' ? (
          <View style={styles.fieldBlock}>
            <Text style={styles.label}>Fréquence personnalisée (en jours)</Text>
            <View style={styles.inputWithUnit}>
              <TextInput
                style={styles.inputField}
                value={customFrequencyDays}
                onChangeText={setCustomFrequencyDays}
                placeholder="Ex : 10"
                placeholderTextColor={Colors.gray[400]}
                keyboardType="number-pad"
              />
              <Text style={styles.unit}>jours</Text>
            </View>
            <Text style={styles.helperText}>
              Les cotisations seront déclenchées tous les {customFrequencyDays || '...'} jours.
            </Text>
          </View>
        ) : null}

        <Text style={styles.sectionEyebrow}>Règles avancées</Text>
        <View style={styles.advancedCard}>
          <View style={styles.switchRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.switchTitle}>Inclure des pénalités</Text>
              <Text style={styles.switchHint}>
                Activez ce mode pour sanctionner les retards ou absences de paiement.
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.switchPill, penaltiesEnabled && styles.switchPillActive]}
              onPress={() => setPenaltiesEnabled((v) => !v)}
              activeOpacity={0.85}
            >
              <View style={[styles.switchKnob, penaltiesEnabled && styles.switchKnobActive]} />
            </TouchableOpacity>
          </View>

          {penaltiesEnabled ? (
            <>
              <Text style={[styles.label, { paddingHorizontal: 0, marginTop: 14 }]}>Type de pénalité</Text>
              <View style={[styles.toggleRow, { paddingHorizontal: 0 }]}>
                {([
                  { key: 'retard', label: 'Retard de paiement' },
                  { key: 'absence', label: 'Absence de paiement' },
                ] as const).map((opt) => (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.toggleButton, penaltyType === opt.key && styles.toggleActive]}
                    onPress={() => setPenaltyType(opt.key)}
                    activeOpacity={0.88}
                  >
                    <Text style={[styles.toggleText, penaltyType === opt.key && styles.toggleTextActive]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.label, { paddingHorizontal: 0, marginTop: 14 }]}>Montant de la pénalité</Text>
              <View style={styles.inputWithUnit}>
                <TextInput
                  style={styles.inputField}
                  value={penaltyAmount}
                  onChangeText={setPenaltyAmount}
                  placeholder="2 000"
                  placeholderTextColor={Colors.gray[400]}
                  keyboardType="number-pad"
                />
                <Text style={styles.unit}>FCFA</Text>
              </View>
            </>
          ) : (
            <Text style={styles.helperText}>Aucune pénalité ne sera appliquée dans cette tontine.</Text>
          )}
        </View>

        <Text style={styles.sectionEyebrow}>Ordre de passage</Text>
        <Text style={styles.sectionHint}>Choisissez comment le bénéficiaire est désigné à chaque cycle.</Text>

        {(
          [
            {
              key: 'random' as const,
              icon: 'shuffle' as const,
              title: 'Aléatoire',
              desc: "L'application tire au sort le bénéficiaire à chaque période.",
            },
            {
              key: 'admin' as const,
              icon: 'clipboard' as const,
              title: "Défini par l'admin",
              desc: "Vous décidez qui reçoit et à quelle date.",
            },
          ] as const
        ).map((opt) => (
          <TouchableOpacity
            key={opt.key}
            style={[styles.radioCard, rotationLogic === opt.key && styles.radioCardActive]}
            onPress={() => setRotationLogic(opt.key)}
            activeOpacity={0.88}
          >
            <View style={[styles.radio, rotationLogic === opt.key && styles.radioActive]}>
              {rotationLogic === opt.key ? <View style={styles.radioInner} /> : null}
            </View>
            <View style={[styles.radioIcon, { backgroundColor: withOpacity(Colors.brand, 0.12) }]}>
              <Feather name={opt.icon} size={22} color={Colors.brand} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.radioTitle}>{opt.title}</Text>
              <Text style={styles.radioDesc}>{opt.desc}</Text>
            </View>
          </TouchableOpacity>
        ))}

        <View style={styles.infoBanner}>
          <View style={styles.infoIconCircle}>
            <Feather name="shield" size={18} color={Colors.success} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.infoTitle}>À savoir</Text>
            <Text style={styles.infoText}>
              Tous les membres devront valider ces règles avant de rejoindre la tontine.
            </Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.createButton}
          onPress={() => router.push({ pathname: '/success', params: { type: 'create-tontine' } })}
          activeOpacity={0.9}
        >
          <Feather name="user-plus" size={20} color={Colors.white} />
          <Text style={styles.createButtonText}>Créer et inviter</Text>
        </TouchableOpacity>

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
    backgroundColor: withOpacity(Colors.brand, 0.12),
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
  sectionHint: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    color: Colors.gray[600],
    paddingHorizontal: Theme.spacing.page,
    marginTop: -8,
    marginBottom: Theme.spacing.md,
    lineHeight: 20,
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
  toggleRow: { flexDirection: 'row', gap: Theme.spacing.md, paddingHorizontal: Theme.spacing.page },
  toggleGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Theme.spacing.md, paddingHorizontal: Theme.spacing.page },
  toggleButton: {
    flexGrow: 1,
    minWidth: '47%',
    paddingVertical: Theme.spacing.md + 2,
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    alignItems: 'center',
    backgroundColor: Theme.screen.surface,
    ...Theme.shadow.soft,
  },
  toggleActive: { backgroundColor: Colors.brand, borderColor: Colors.brand },
  toggleText: { fontFamily: Fonts.outfit.medium, fontSize: 15, color: Colors.gray[700] },
  toggleTextActive: { color: Colors.white },
  helperText: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 12,
    color: Colors.gray[500],
    marginTop: 8,
    paddingHorizontal: Theme.spacing.page,
  },
  advancedCard: {
    marginHorizontal: Theme.spacing.page,
    borderRadius: Theme.radius.lg,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    backgroundColor: Theme.screen.surface,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.xl,
    ...Theme.shadow.soft,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  switchTitle: { fontFamily: Fonts.outfit.medium, fontSize: 15, color: Colors.gray[900], marginBottom: 4 },
  switchHint: { fontFamily: Fonts.outfit.regular, fontSize: 13, color: Colors.gray[600], lineHeight: 18 },
  switchPill: {
    width: 52,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.gray[300],
    paddingHorizontal: 4,
    justifyContent: 'center',
  },
  switchPillActive: {
    backgroundColor: withOpacity(Colors.success, 0.6),
  },
  switchKnob: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.white,
  },
  switchKnobActive: {
    alignSelf: 'flex-end',
  },
  radioCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Theme.spacing.md,
    marginHorizontal: Theme.spacing.page,
    borderRadius: Theme.radius.lg,
    padding: Theme.spacing.lg,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    marginBottom: Theme.spacing.md,
    backgroundColor: Theme.screen.surface,
    ...Theme.shadow.card,
  },
  radioCardActive: {
    borderColor: withOpacity(Colors.brand, 0.45),
    backgroundColor: withOpacity(Colors.brand, 0.04),
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: Colors.gray[300],
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  radioActive: { borderColor: Colors.brand, backgroundColor: Colors.brand },
  radioInner: { width: 8, height: 8, borderRadius: 4, backgroundColor: Theme.screen.surface },
  radioIcon: {
    width: 48,
    height: 48,
    borderRadius: Theme.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioTitle: {
    fontFamily: Fonts.spaceGrotesk.bold,
    fontSize: 17,
    color: Colors.gray[900],
    marginBottom: 4,
  },
  radioDesc: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[600], lineHeight: 20 },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Theme.spacing.md,
    marginHorizontal: Theme.spacing.page,
    marginTop: Theme.spacing.sm,
    marginBottom: Theme.spacing.xl,
    padding: Theme.spacing.lg,
    backgroundColor: withOpacity(Colors.success, 0.08),
    borderRadius: Theme.radius.lg,
    borderWidth: 1,
    borderColor: withOpacity(Colors.success, 0.22),
    ...Theme.shadow.soft,
  },
  infoIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: withOpacity(Colors.success, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoTitle: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.gray[900], marginBottom: 6 },
  infoText: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[700], lineHeight: 21 },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Colors.brand,
    paddingVertical: Theme.spacing.lg,
    borderRadius: Theme.radius.md,
    ...Theme.shadow.soft,
  },
  createButtonText: { fontFamily: Fonts.outfit.medium, fontSize: 17, color: Colors.white },
});
