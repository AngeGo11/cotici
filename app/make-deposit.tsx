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

const PAY_AMOUNT_F = 10_000;
const FEE_F = 0;

const providers = [
  { id: 'orange' as const, name: 'Orange Money', bg: Colors.provider.orange, text: Colors.white },
  { id: 'mtn' as const, name: 'MTN MoMo', bg: Colors.provider.mtn, text: Colors.gray[900] },
  { id: 'wave' as const, name: 'Wave', bg: Colors.provider.wave, text: Colors.white },
  { id: 'moov' as const, name: 'Moov Money', bg: Colors.provider.moov, text: Colors.white },
];

export default function MakeDepositScreen() {
  const router = useRouter();
  const [selectedProvider, setSelectedProvider] = useState<PaymentProvider>(null);
  const [phoneNumber, setPhoneNumber] = useState('+225 07 08 09 10 11');

  const total = PAY_AMOUNT_F + FEE_F;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.85}>
            <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
          </TouchableOpacity>
        </View>

        <View style={styles.titleBlock}>
          <View style={styles.titleRow}>
            <View style={styles.titleIcon}>
              <Feather name="credit-card" size={24} color={Colors.success} />
            </View>
            <View style={styles.titleTextWrap}>
              <Text style={styles.title}>Effectuer un dépôt</Text>
              <Text style={styles.subtitle}>Réglez votre cotisation depuis votre Mobile Money</Text>
            </View>
          </View>
        </View>

        <View style={styles.payHero}>
          <Text style={styles.payTag}>Paiement à effectuer</Text>
          <View style={styles.payTopRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.payLabel}>Motif</Text>
              <Text style={styles.payMotif}>Cotisation tontine — Tour 3</Text>
            </View>
            <View style={styles.payMotifIcon}>
              <Feather name="users" size={22} color={Colors.success} />
            </View>
          </View>
          <View style={styles.payDivider} />
          <Text style={styles.payAmountLabel}>Montant</Text>
          <Text style={styles.payAmount}>
            {PAY_AMOUNT_F.toLocaleString('fr-FR')}{' '}
            <Text style={styles.payAmountCurrency}>FCFA</Text>
          </Text>
        </View>

        <Text style={styles.sectionEyebrow}>Opérateur Mobile Money</Text>
        <Text style={styles.sectionHint}>Choisissez le compte depuis lequel vous payez</Text>

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

        <Text style={styles.sectionEyebrow}>Compte débité</Text>
        <View style={styles.surfaceCard}>
          <Text style={styles.inCardLabel}>Numéro de téléphone lié au portefeuille</Text>
          <TextInput
            style={styles.inputBare}
            value={phoneNumber}
            onChangeText={setPhoneNumber}
            placeholder="+225 …"
            placeholderTextColor={Colors.gray[400]}
            keyboardType="phone-pad"
          />
        </View>

        <View style={styles.recapCard}>
          <Text style={styles.recapTitle}>Récapitulatif</Text>
          <View style={styles.recapRow}>
            <Text style={styles.recapLabel}>Montant cotisation</Text>
            <Text style={styles.recapValue}>{PAY_AMOUNT_F.toLocaleString('fr-FR')} F</Text>
          </View>
          <View style={styles.recapRow}>
            <Text style={styles.recapLabel}>Frais</Text>
            <Text style={styles.recapValue}>{FEE_F.toLocaleString('fr-FR')} F</Text>
          </View>
          <View style={styles.recapDivider} />
          <View style={styles.recapRow}>
            <Text style={styles.recapTotal}>Total à payer</Text>
            <Text style={styles.recapTotalValue}>{total.toLocaleString('fr-FR')} F</Text>
          </View>
        </View>

        <View style={styles.securityPill}>
          <Feather name="shield" size={16} color={Colors.success} />
          <Text style={styles.securityText}>Transaction sécurisée — données chiffrées</Text>
        </View>

        <TouchableOpacity
          style={[styles.confirmButton, !selectedProvider && styles.confirmDisabled]}
          disabled={!selectedProvider}
          onPress={() => router.push({ pathname: '/success', params: { type: 'payment' } })}
          activeOpacity={0.9}
        >
          <Feather name="check-circle" size={20} color={selectedProvider ? Colors.white : Colors.gray[400]} />
          <Text style={[styles.confirmText, !selectedProvider && { color: Colors.gray[400] }]}>
            Confirmer le paiement
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
    backgroundColor: withOpacity(Colors.success, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleTextWrap: { flex: 1 },
  title: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 26, color: Colors.gray[900], marginBottom: 6 },
  subtitle: { fontFamily: Fonts.outfit.regular, fontSize: 15, color: Colors.gray[600], lineHeight: 22 },
  payHero: {
    marginHorizontal: Theme.spacing.page,
    backgroundColor: withOpacity(Colors.success, 0.1),
    borderRadius: Theme.radius.xl,
    padding: Theme.spacing.xl,
    marginBottom: Theme.spacing.xl,
    borderWidth: 1,
    borderColor: withOpacity(Colors.success, 0.22),
    ...Theme.shadow.soft,
  },
  payTag: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 11,
    color: Colors.gray[600],
    letterSpacing: 0.6,
    marginBottom: Theme.spacing.md,
    textTransform: 'uppercase',
  },
  payTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: Theme.spacing.md },
  payLabel: { fontFamily: Fonts.outfit.regular, fontSize: 13, color: Colors.gray[600], marginBottom: 4 },
  payMotif: { fontFamily: Fonts.outfit.medium, fontSize: 15, color: Colors.gray[900], lineHeight: 21 },
  payMotifIcon: {
    width: 48,
    height: 48,
    borderRadius: Theme.radius.sm,
    backgroundColor: withOpacity(Colors.success, 0.15),
    alignItems: 'center',
    justifyContent: 'center',
  },
  payDivider: { height: 1, backgroundColor: withOpacity(Colors.success, 0.25), marginBottom: Theme.spacing.md },
  payAmountLabel: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[600], marginBottom: 6 },
  payAmount: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 34, color: Colors.success },
  payAmountCurrency: { fontSize: 22 },
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
  recapCard: {
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Theme.screen.surface,
    borderRadius: Theme.radius.lg,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.lg,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    ...Theme.shadow.soft,
  },
  recapTitle: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 13,
    color: Colors.gray[500],
    marginBottom: Theme.spacing.md,
    letterSpacing: 0.2,
  },
  recapRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  recapLabel: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[600] },
  recapValue: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.gray[900] },
  recapDivider: { height: 1, backgroundColor: Colors.gray[100], marginVertical: 8 },
  recapTotal: { fontFamily: Fonts.outfit.medium, fontSize: 15, color: Colors.gray[900] },
  recapTotalValue: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 18, color: Colors.gray[900] },
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Colors.brand,
    paddingVertical: 18,
    borderRadius: Theme.radius.md,
    ...Theme.shadow.soft,
  },
  confirmDisabled: { backgroundColor: Colors.gray[200], shadowOpacity: 0, elevation: 0 },
  confirmText: { fontFamily: Fonts.outfit.medium, fontSize: 18, color: Colors.white },
});
