import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Svg, Circle } from 'react-native-svg';
import { Colors, withOpacity } from '@/constants/Colors';
import { Fonts } from '@/constants/Fonts';
import { Theme } from '@/constants/Theme';

const currentAmount = 325000;
const targetAmount = 500000;
const quickAmounts = [10000, 25000, 50000, 100000];

export default function AddToSavingsScreen() {
  const router = useRouter();
  const [addAmount, setAddAmount] = useState('');

  const newTotal = addAmount ? currentAmount + Number(addAmount) : null;
  const newPercentage = newTotal ? Math.min((newTotal / targetAmount) * 100, 100).toFixed(0) : null;
  const remaining = newTotal ? Math.max(targetAmount - newTotal, 0) : null;

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}><TouchableOpacity style={styles.backButton} onPress={() => router.back()}><Feather name="chevron-left" size={20} color={Colors.gray[700]} /></TouchableOpacity></View>
        <View style={styles.titleRow}><View style={styles.titleIcon}><Feather name="dollar-sign" size={24} color={Colors.success} /></View><Text style={styles.title}>Ajouter de l'argent</Text></View>
        <Text style={styles.subtitle}>Contribuez à votre objectif d'épargne</Text>

        <View style={styles.goalCard}>
          <View style={styles.goalRow}>
            <View style={{ flex: 1 }}><Text style={styles.goalLabel}>Votre objectif</Text><Text style={styles.goalName}>Nouveau Projet</Text></View>
            <View style={{ width: 64, height: 64, position: 'relative', alignItems: 'center', justifyContent: 'center' }}>
              <Svg width={64} height={64} style={{ transform: [{ rotate: '-90deg' }] }}><Circle cx={32} cy={32} r={28} stroke={Colors.gray[200]} strokeWidth={6} fill="none" /><Circle cx={32} cy={32} r={28} stroke={Colors.success} strokeWidth={6} fill="none" strokeDasharray={`${2 * Math.PI * 28}`} strokeDashoffset={`${2 * Math.PI * 28 * 0.35}`} strokeLinecap="round" /></Svg>
              <Text style={styles.circleText}>65%</Text>
            </View>
          </View>
          <View style={styles.goalDivider} />
          <View style={styles.goalDetailRow}><Text style={styles.goalDetailLabel}>Épargné</Text><Text style={styles.goalDetailValue}>{currentAmount.toLocaleString('fr-FR')} F</Text></View>
          <View style={styles.goalDetailRow}><Text style={styles.goalDetailLabel}>Objectif</Text><Text style={styles.goalDetailValue}>{targetAmount.toLocaleString('fr-FR')} F</Text></View>
        </View>

        <Text style={styles.label}>Montant à ajouter</Text>
        <View style={styles.amountInputRow}><TextInput style={styles.amountInput} value={addAmount} onChangeText={setAddAmount} placeholder="Entrez le montant" placeholderTextColor={Colors.gray[400]} keyboardType="number-pad" /><Text style={styles.unit}>FCFA</Text></View>
        <Text style={styles.quickLabel}>Montants rapides</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickScroll} contentContainerStyle={styles.quickRow}>
          {quickAmounts.map((a) => (<TouchableOpacity key={a} style={styles.quickChip} onPress={() => setAddAmount(a.toString())}><Text style={styles.quickChipText}>{a.toLocaleString('fr-FR')} F</Text></TouchableOpacity>))}
        </ScrollView>

        <TouchableOpacity style={styles.completeButton} onPress={() => setAddAmount((targetAmount - currentAmount).toString())}>
          <Text style={styles.completeLabel}>Compléter l'objectif</Text>
          <Text style={styles.completeValue}>{(targetAmount - currentAmount).toLocaleString('fr-FR')} F</Text>
        </TouchableOpacity>

        {newTotal !== null && (
          <View style={styles.progressCard}>
            <View style={styles.progressTop}><View style={styles.progressIcon}><Feather name="trending-up" size={20} color={Colors.success} /></View><View><Text style={styles.progressLabel}>Nouvelle progression</Text><Text style={styles.progressPercent}>{newPercentage}%</Text></View></View>
            <View style={styles.progressDetailRow}><Text style={styles.progressDetailLabel}>Nouveau total</Text><Text style={styles.progressDetailValue}>{newTotal.toLocaleString('fr-FR')} F</Text></View>
            <View style={styles.progressDetailRow}><Text style={styles.progressDetailLabel}>Reste à épargner</Text><Text style={styles.progressDetailRemaining}>{remaining?.toLocaleString('fr-FR')} F</Text></View>
            <View style={styles.progressBar}><View style={[styles.progressFill, { width: `${newPercentage}%` as unknown as number }]} /></View>
            {newPercentage === '100' && <View style={styles.celebrationRow}><Text style={{ fontSize: 24 }}>🎉</Text><Text style={styles.celebrationText}>Félicitations ! Objectif atteint !</Text></View>}
          </View>
        )}

        <TouchableOpacity style={[styles.confirmButton, (!addAmount || Number(addAmount) <= 0) && styles.confirmDisabled]} disabled={!addAmount || Number(addAmount) <= 0} onPress={() => router.push({ pathname: '/success', params: { type: 'savings' } })}>
          <Text style={[styles.confirmText, (!addAmount || Number(addAmount) <= 0) && { color: Colors.gray[400] }]}>Ajouter à mon épargne</Text>
        </TouchableOpacity>
        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.screen.bg },
  header: { paddingHorizontal: Theme.spacing.page, paddingVertical: 12 },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.gray[100], alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: Theme.spacing.page },
  titleIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: withOpacity(Colors.success, 0.1), alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 28, color: Colors.gray[900] },
  subtitle: { fontFamily: Fonts.outfit.regular, fontSize: 16, color: Colors.gray[600], paddingHorizontal: Theme.spacing.page, marginTop: 8, marginBottom: 24 },
  goalCard: { marginHorizontal: Theme.spacing.page, backgroundColor: withOpacity(Colors.success, 0.1), borderRadius: 24, padding: 24, marginBottom: 24, borderWidth: 2, borderColor: withOpacity(Colors.success, 0.2) },
  goalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  goalLabel: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[600], marginBottom: 4 },
  goalName: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 20, color: Colors.gray[900] },
  circleText: { position: 'absolute', fontFamily: Fonts.spaceGrotesk.bold, fontSize: 14, color: Colors.success },
  goalDivider: { height: 1, backgroundColor: withOpacity(Colors.success, 0.2), marginVertical: 16 },
  goalDetailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  goalDetailLabel: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[600] },
  goalDetailValue: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.gray[900] },
  label: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.gray[700], paddingHorizontal: Theme.spacing.page, marginBottom: 8 },
  amountInputRow: { flexDirection: 'row', alignItems: 'center', marginHorizontal: Theme.spacing.page, backgroundColor: Colors.gray[50], borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[100], marginBottom: 12 },
  amountInput: { flex: 1, paddingHorizontal: 16, paddingVertical: 20, fontFamily: Fonts.spaceGrotesk.bold, fontSize: 24, color: Colors.gray[900] },
  unit: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.gray[500], paddingRight: 16 },
  quickLabel: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[600], paddingHorizontal: Theme.spacing.page, marginBottom: 8 },
  quickScroll: { marginBottom: 16 },
  quickRow: { paddingHorizontal: Theme.spacing.page, gap: 8 },
  quickChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 12, backgroundColor: Theme.screen.surface, borderWidth: 2, borderColor: Colors.gray[200] },
  quickChipText: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[700] },
  completeButton: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: Theme.spacing.page, backgroundColor: withOpacity(Colors.success, 0.1), borderRadius: 12, padding: 12, borderWidth: 1, borderColor: withOpacity(Colors.success, 0.2), marginBottom: 24 },
  completeLabel: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[700] },
  completeValue: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 14, color: Colors.success },
  progressCard: { marginHorizontal: Theme.spacing.page, backgroundColor: withOpacity(Colors.success, 0.1), borderRadius: 16, padding: 20, marginBottom: 24, borderWidth: 2, borderColor: withOpacity(Colors.success, 0.2) },
  progressTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  progressIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: withOpacity(Colors.success, 0.1), alignItems: 'center', justifyContent: 'center' },
  progressLabel: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[600] },
  progressPercent: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 24, color: Colors.success },
  progressDetailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressDetailLabel: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[600] },
  progressDetailValue: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.gray[900] },
  progressDetailRemaining: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.brand },
  progressBar: { height: 8, backgroundColor: Colors.gray[200], borderRadius: 4, marginTop: 8 },
  progressFill: { height: 8, backgroundColor: Colors.success, borderRadius: 4 },
  celebrationRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: Theme.screen.surface, borderRadius: 12, padding: 12, marginTop: 16 },
  celebrationText: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.success },
  confirmButton: { marginHorizontal: Theme.spacing.page, backgroundColor: Colors.success, paddingVertical: 20, borderRadius: 16, alignItems: 'center' },
  confirmDisabled: { backgroundColor: Colors.gray[200] },
  confirmText: { fontFamily: Fonts.outfit.medium, fontSize: 18, color: Colors.white },
});
