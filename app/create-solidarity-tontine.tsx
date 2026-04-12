import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/constants/Colors';
import { Fonts } from '@/constants/Fonts';
import { Theme } from '@/constants/Theme';

const solidarityReasons = ['Maladie', 'Décès', 'Mariage', 'Naissance', 'Études', 'Autre'] as const;

export default function CreateSolidarityTontineScreen() {
  const router = useRouter();
  const [beneficiaryName, setBeneficiaryName] = useState('');
  const [reason, setReason] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [contributionAmount, setContributionAmount] = useState('');

  const participants =
    targetAmount && contributionAmount ? Math.ceil(Number(targetAmount) / Number(contributionAmount)) : 0;

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
            <Feather name="heart" size={28} color={Colors.brand} />
          </View>
          <Text style={styles.heroTitle}>Tontine solidaire</Text>
          <Text style={styles.heroSubtitle}>
            Mobilisez votre communauté pour soutenir une personne : définissez le besoin et la collecte.
          </Text>
        </View>

        <Text style={styles.sectionEyebrow}>Bénéficiaire</Text>
        <View style={styles.beneficiaryCard}>
          <View style={styles.beneficiaryAvatar}>
            <Feather name="user-plus" size={32} color={Colors.white} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.beneficiaryLabel}>Qui aidez-vous ?</Text>
            <TextInput
              style={styles.beneficiaryInput}
              value={beneficiaryName}
              onChangeText={setBeneficiaryName}
              placeholder="Nom ou numéro de téléphone"
              placeholderTextColor={Colors.gray[400]}
            />
          </View>
        </View>

        <Text style={styles.sectionEyebrow}>Motif & montants</Text>

        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Motif (libre ou choix rapide)</Text>
          <TextInput
            style={styles.input}
            value={reason}
            onChangeText={setReason}
            placeholder="Ex. : frais médicaux, funérailles…"
            placeholderTextColor={Colors.gray[400]}
          />
        </View>

        <View style={styles.reasonChips}>
          {solidarityReasons.map((r) => {
            const active = reason === r;
            return (
              <TouchableOpacity
                key={r}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => setReason(r)}
                activeOpacity={0.85}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{r}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Montant nécessaire</Text>
          <View style={styles.inputWithUnit}>
            <TextInput
              style={styles.inputField}
              value={targetAmount}
              onChangeText={setTargetAmount}
              placeholder="500 000"
              placeholderTextColor={Colors.gray[400]}
              keyboardType="number-pad"
            />
            <Text style={styles.unit}>FCFA</Text>
          </View>
        </View>

        <View style={styles.fieldBlock}>
          <Text style={styles.label}>Montant par participant</Text>
          <View style={styles.inputWithUnit}>
            <TextInput
              style={styles.inputField}
              value={contributionAmount}
              onChangeText={setContributionAmount}
              placeholder="25 000"
              placeholderTextColor={Colors.gray[400]}
              keyboardType="number-pad"
            />
            <Text style={styles.unit}>FCFA</Text>
          </View>
        </View>

        {participants > 0 && (
          <View style={styles.previewCard}>
            <View style={styles.previewRow}>
              <View>
                <Text style={styles.previewLabel}>Participants nécessaires (estimé)</Text>
                <Text style={styles.previewValue}>{participants}</Text>
              </View>
              <View style={styles.previewIcon}>
                <Feather name="users" size={26} color={Colors.brand} />
              </View>
            </View>
            <Text style={styles.previewSub}>Basé sur l&apos;objectif et la mise par personne</Text>
          </View>
        )}

        <TouchableOpacity
          style={styles.createButton}
          onPress={() => router.push({ pathname: '/success', params: { type: 'create-solidarity' } })}
          activeOpacity={0.9}
        >
          <Feather name="heart" size={20} color={Colors.white} />
          <Text style={styles.createButtonText}>Créer le groupe de soutien</Text>
        </TouchableOpacity>
        <Text style={styles.footerNote}>Vous pourrez inviter les participants après la création.</Text>

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
    backgroundColor: withOpacity(Colors.brand, 0.14),
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
  beneficiaryCard: {
    flexDirection: 'row',
    gap: Theme.spacing.lg,
    marginHorizontal: Theme.spacing.page,
    backgroundColor: withOpacity(Colors.brand, 0.06),
    borderRadius: Theme.radius.xl,
    padding: Theme.spacing.xl,
    marginBottom: Theme.spacing.xl,
    borderWidth: 1,
    borderColor: withOpacity(Colors.brand, 0.2),
    ...Theme.shadow.soft,
  },
  beneficiaryAvatar: {
    width: 72,
    height: 72,
    borderRadius: Theme.radius.md,
    backgroundColor: Colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    ...Theme.shadow.soft,
  },
  beneficiaryLabel: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 14,
    color: Colors.gray[700],
    marginBottom: 8,
  },
  beneficiaryInput: {
    backgroundColor: Theme.screen.surface,
    borderRadius: Theme.radius.md,
    paddingHorizontal: Theme.spacing.lg,
    paddingVertical: Theme.spacing.md,
    fontFamily: Fonts.outfit.regular,
    fontSize: 15,
    color: Colors.gray[900],
    borderWidth: 1,
    borderColor: Colors.gray[100],
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
  reasonChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Theme.spacing.sm,
    paddingHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.lg,
  },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: Theme.spacing.md,
    borderRadius: Theme.radius.pill,
    backgroundColor: Theme.screen.surface,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    ...Theme.shadow.soft,
  },
  chipActive: { backgroundColor: Colors.brand, borderColor: Colors.brand },
  chipText: { fontFamily: Fonts.outfit.medium, fontSize: 13, color: Colors.gray[700] },
  chipTextActive: { color: Colors.white },
  previewCard: {
    marginHorizontal: Theme.spacing.page,
    backgroundColor: withOpacity(Colors.brand, 0.08),
    borderRadius: Theme.radius.xl,
    padding: Theme.spacing.xl,
    marginBottom: Theme.spacing.xl,
    borderWidth: 1,
    borderColor: withOpacity(Colors.brand, 0.22),
    ...Theme.shadow.soft,
  },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  previewLabel: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[600], marginBottom: 4 },
  previewValue: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 32, color: Colors.brand },
  previewIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: withOpacity(Colors.brand, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewSub: { fontFamily: Fonts.outfit.regular, fontSize: 13, color: Colors.gray[600], lineHeight: 18 },
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
