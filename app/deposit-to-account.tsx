import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/constants/Colors';
import { Fonts } from '@/constants/Fonts';
import { Theme } from '@/constants/Theme';
import { PaymentProviderMark } from '@/components/PaymentProviderMark';
import type { PaymentProvider } from '@/types';

const CURRENT_BALANCE = 487_000;

const providers = [
  { id: 'orange' as const, name: 'Orange Money', bg: Colors.provider.orange, text: Colors.white },
  { id: 'mtn' as const, name: 'MTN MoMo', bg: Colors.provider.mtn, text: Colors.gray[900] },
  { id: 'wave' as const, name: 'Wave', bg: Colors.provider.wave, text: Colors.white },
  { id: 'moov' as const, name: 'Moov Money', bg: Colors.provider.moov, text: Colors.white },
];

const quickAmounts = [5000, 10000, 25000, 50000, 100000];

export default function DepositToAccountScreen() {
  const router = useRouter();
  const [selectedProvider, setSelectedProvider] = useState<PaymentProvider>(null);
  const [depositAmount, setDepositAmount] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('+225 07 08 09 10 11');

  const amountNum = depositAmount ? Number(depositAmount.replace(/\s/g, '')) : 0;
  const previewNew =
    depositAmount && !Number.isNaN(amountNum) && amountNum > 0
      ? CURRENT_BALANCE + amountNum
      : null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
          </TouchableOpacity>
        </View>

        <View style={styles.titleBlock}>
          <View style={styles.titleRow}>
            <View style={styles.titleIcon}>
              <Feather name="arrow-down-left" size={24} color={Colors.brand} />
            </View>
            <View style={styles.titleTextWrap}>
              <Text style={styles.title}>Recharger mon compte</Text>
              <Text style={styles.subtitle}>
                {"Ajoutez de l'argent à votre solde COTICI"}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.balanceHero}>
          <Text style={styles.balanceTag}>Compte principal</Text>
          <Text style={styles.balanceLabel}>Solde actuel</Text>
          <Text style={styles.balanceValue}>
            {CURRENT_BALANCE.toLocaleString('fr-FR')}{' '}
            <Text style={styles.balanceCurrency}>FCFA</Text>
          </Text>
          <Text style={styles.balanceHint}>+25.000 FCFA ce mois</Text>
        </View>

        <Text style={styles.sectionEyebrow}>Montant</Text>
        <View style={styles.surfaceCard}>
          <Text style={styles.inCardLabel}>Combien souhaitez-vous ajouter ?</Text>
          <View style={styles.amountInputRow}>
            <TextInput
              style={styles.amountInput}
              value={depositAmount}
              onChangeText={setDepositAmount}
              placeholder="0"
              placeholderTextColor={Colors.gray[400]}
              keyboardType="number-pad"
            />
            <Text style={styles.unit}>FCFA</Text>
          </View>
          <Text style={styles.quickLabel}>Montants rapides</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.quickRow}
          >
            {quickAmounts.map((a) => {
              const selected = depositAmount === a.toString();
              return (
                <TouchableOpacity
                  key={a}
                  style={[styles.quickChip, selected && styles.quickChipSelected]}
                  onPress={() => setDepositAmount(a.toString())}
                >
                  <Text style={[styles.quickChipText, selected && styles.quickChipTextSelected]}>
                    {a.toLocaleString('fr-FR')} F
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <Text style={styles.sectionEyebrow}>Opérateur Mobile Money</Text>
        <Text style={styles.sectionHint}>Sélectionnez depuis quel compte vous payez</Text>
        <View style={styles.providerGrid}>
          {providers.map((p) => (
            <TouchableOpacity
              key={p.id}
              style={[
                styles.providerCard,
                { backgroundColor: p.bg },
                selectedProvider === p.id && styles.providerSelected,
                Theme.shadow.soft,
              ]}
              onPress={() => setSelectedProvider(p.id)}
              activeOpacity={0.85}
            >
              <View style={styles.providerLogoWrap}>
                <PaymentProviderMark providerId={p.id} maxWidth={112} maxHeight={34} />
              </View>
              <Text style={[styles.providerName, { color: p.text }]}>{p.name}</Text>
              {selectedProvider === p.id ? (
                <View style={styles.checkMark}>
                  <Feather name="check" size={16} color={Colors.success} />
                </View>
              ) : null}
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionEyebrow}>Numéro du compte</Text>
        <View style={styles.surfaceCard}>
          <Text style={styles.inCardLabel}>Téléphone utilisé pour le paiement</Text>
          <TextInput
            style={styles.inputBare}
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            keyboardType="phone-pad"
            placeholder="+225 …"
            placeholderTextColor={Colors.gray[400]}
          />
        </View>

        {previewNew !== null ? (
          <View style={styles.previewCard}>
            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>Nouveau solde estimé</Text>
              <Text style={styles.previewValue}>{previewNew.toLocaleString('fr-FR')} F</Text>
            </View>
          </View>
        ) : null}

        <View style={styles.securityPill}>
          <Feather name="shield" size={16} color={Colors.success} />
          <Text style={styles.securityText}>Paiement sécurisé — données chiffrées</Text>
        </View>

        <TouchableOpacity
          style={[styles.confirmButton, (!selectedProvider || !depositAmount) && styles.confirmDisabled]}
          disabled={!selectedProvider || !depositAmount}
          onPress={() => router.push({ pathname: '/success', params: { type: 'deposit' } })}
          activeOpacity={0.9}
        >
          <Text style={[styles.confirmText, (!selectedProvider || !depositAmount) && { color: Colors.gray[400] }]}>
            Confirmer le dépôt
          </Text>
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
  titleBlock: { paddingHorizontal: Theme.spacing.page, marginBottom: Theme.spacing.lg },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: Theme.spacing.md },
  titleIcon: {
    width: 52,
    height: 52,
    borderRadius: Theme.radius.md,
    backgroundColor: withOpacity(Colors.brand, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleTextWrap: { flex: 1 },
  title: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 26, color: Colors.gray[900], marginBottom: 6 },
  subtitle: { fontFamily: Fonts.outfit.regular, fontSize: 15, color: Colors.gray[600], lineHeight: 22 },
  balanceHero: {
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Colors.brand,
    borderRadius: Theme.radius.xl,
    padding: Theme.spacing.xl,
    marginBottom: Theme.spacing.xl,
    ...Theme.shadow.brandHero,
  },
  balanceTag: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 0.8,
    marginBottom: Theme.spacing.sm,
    textTransform: 'uppercase',
  },
  balanceLabel: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: 'rgba(255,255,255,0.85)', marginBottom: 8 },
  balanceValue: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 34, color: Colors.white },
  balanceCurrency: { fontSize: 20 },
  balanceHint: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    marginTop: Theme.spacing.sm,
  },
  sectionEyebrow: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 13,
    color: Colors.gray[500],
    paddingHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.sm,
    letterSpacing: 0.2,
  },
  sectionHint: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 13,
    color: Colors.gray[500],
    paddingHorizontal: Theme.spacing.page,
    marginTop: -4,
    marginBottom: Theme.spacing.md,
  },
  surfaceCard: {
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Theme.screen.surface,
    borderRadius: Theme.radius.lg,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.xl,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    ...Theme.shadow.card,
  },
  inCardLabel: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 13,
    color: Colors.gray[600],
    marginBottom: Theme.spacing.md,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray[50],
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    marginBottom: Theme.spacing.lg,
  },
  amountInput: {
    flex: 1,
    paddingHorizontal: Theme.spacing.lg,
    paddingVertical: 18,
    fontFamily: Fonts.spaceGrotesk.bold,
    fontSize: 28,
    color: Colors.gray[900],
  },
  unit: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.gray[500], paddingRight: Theme.spacing.lg },
  quickLabel: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 12,
    color: Colors.gray[500],
    marginBottom: Theme.spacing.sm,
  },
  quickRow: { flexDirection: 'row', gap: Theme.spacing.sm, flexWrap: 'wrap' },
  quickChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Theme.radius.sm,
    backgroundColor: Colors.gray[50],
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  quickChipSelected: {
    borderColor: Colors.brand,
    backgroundColor: withOpacity(Colors.brand, 0.08),
  },
  quickChipText: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.gray[700] },
  quickChipTextSelected: { color: Colors.brand },
  providerGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Theme.spacing.md,
    paddingHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.xl,
  },
  providerCard: {
    width: '47%',
    borderRadius: Theme.radius.md,
    padding: 20,
    alignItems: 'center',
    gap: 8,
    position: 'relative',
  },
  providerSelected: { borderWidth: 3, borderColor: withOpacity(Colors.brand, 0.45) },
  providerLogoWrap: {
    width: '100%',
    backgroundColor: Theme.screen.surface,
    borderRadius: Theme.radius.sm,
    paddingVertical: 10,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
  },
  providerName: { fontFamily: Fonts.outfit.medium, fontSize: 14 },
  checkMark: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Theme.screen.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...Theme.shadow.soft,
  },
  inputBare: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 16,
    color: Colors.gray[900],
    paddingVertical: 14,
    paddingHorizontal: Theme.spacing.md,
    backgroundColor: Colors.gray[50],
    borderRadius: Theme.radius.sm,
    borderWidth: 1,
    borderColor: Colors.gray[100],
  },
  previewCard: {
    marginHorizontal: Theme.spacing.page,
    backgroundColor: withOpacity(Colors.success, 0.1),
    borderRadius: Theme.radius.lg,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.xl,
    borderWidth: 1,
    borderColor: withOpacity(Colors.success, 0.25),
    ...Theme.shadow.soft,
  },
  previewRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  previewLabel: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[600] },
  previewValue: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 20, color: Colors.success },
  securityPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    alignSelf: 'center',
    paddingHorizontal: Theme.spacing.lg,
    paddingVertical: 10,
    borderRadius: Theme.radius.pill,
    backgroundColor: withOpacity(Colors.success, 0.08),
    marginBottom: Theme.spacing.xl,
  },
  securityText: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[600] },
  confirmButton: {
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Colors.brand,
    paddingVertical: 18,
    borderRadius: Theme.radius.md,
    alignItems: 'center',
    ...Theme.shadow.soft,
  },
  confirmDisabled: { backgroundColor: Colors.gray[200], shadowOpacity: 0, elevation: 0 },
  confirmText: { fontFamily: Fonts.outfit.medium, fontSize: 18, color: Colors.white },
});
