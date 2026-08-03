import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { AnimatedPressable } from '@/shared/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Svg, Circle } from 'react-native-svg';
import { depositToSavings } from '@/shared/api';
import { useAuth } from '@/shared/auth';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';
import { useSavingsDetail } from '@/modules/savings/hooks/useSavingsDetail';

const quickAmounts = [10000, 25000, 50000, 100000];

const MINI_SIZE = 64;
const MINI_R = 28;
const MINI_STROKE = 6;
const MINI_CIRCUMFERENCE = 2 * Math.PI * MINI_R;

function parsePositiveInt(value: string): number | null {
  const n = Number(value.replace(/\s/g, ''));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

export default function AddToSavingsScreen() {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const [addAmount, setAddAmount] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const { id } = useLocalSearchParams<{ id: string }>();
  const { detail, loading, error } = useSavingsDetail(id);

  const amountNum = useMemo(() => parsePositiveInt(addAmount), [addAmount]);

  const preview = useMemo(() => {
    if (!detail || amountNum === null) return null;
    const newTotal = detail.saved + amountNum;
    const newPercentage =
      detail.target > 0
        ? Math.min(100, Math.round((newTotal / detail.target) * 100))
        : 0;
    const newRemaining = Math.max(0, detail.target - newTotal);
    return { newTotal, newPercentage, newRemaining };
  }, [detail, amountNum]);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.brand} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !detail) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <AnimatedPressable style={styles.backButton} onPress={() => router.back()}>
            <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
          </AnimatedPressable>
        </View>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error ?? 'Objectif introuvable.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const percentage = detail.percentage;
  const miniProgressOffset = ((100 - percentage) / 100) * MINI_CIRCUMFERENCE;
  const amountExceedsRemaining = amountNum !== null && amountNum > detail.remaining;
  const canSubmit =
    amountNum !== null &&
    amountNum <= detail.remaining &&
    !isSubmitting &&
    detail.remaining > 0;

  const handleConfirm = async () => {
    if (!canSubmit || amountNum === null) return;

    setIsSubmitting(true);
    setErrorMessage('');

    const result = await depositToSavings({ id: detail.id, montant: amountNum });
    if (!result.ok) {
      setErrorMessage(result.detail);
      setIsSubmitting(false);
      return;
    }

    await refreshUser();
    setIsSubmitting(false);
    router.push({ pathname: '/success', params: { type: 'savings' } });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <AnimatedPressable style={styles.backButton} onPress={() => router.back()}>
            <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
          </AnimatedPressable>
        </View>

        <View style={styles.titleRow}>
          <View style={styles.titleIcon}>
            <Feather name="dollar-sign" size={24} color={Colors.success} />
          </View>
          <Text style={styles.title}>Ajouter de l&apos;argent</Text>
        </View>
        <Text style={styles.subtitle}>Contribuez à votre objectif d&apos;épargne</Text>

        <View style={styles.goalCard}>
          <View style={styles.goalRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.goalLabel}>Votre objectif</Text>
              <Text style={styles.goalName}>{detail.name}</Text>
            </View>
            <View style={styles.miniCircleWrap}>
              <Svg
                width={MINI_SIZE}
                height={MINI_SIZE}
                style={{ transform: [{ rotate: '-90deg' }] }}
              >
                <Circle
                  cx={MINI_SIZE / 2}
                  cy={MINI_SIZE / 2}
                  r={MINI_R}
                  stroke={Colors.gray[200]}
                  strokeWidth={MINI_STROKE}
                  fill="none"
                />
                <Circle
                  cx={MINI_SIZE / 2}
                  cy={MINI_SIZE / 2}
                  r={MINI_R}
                  stroke={Colors.success}
                  strokeWidth={MINI_STROKE}
                  fill="none"
                  strokeDasharray={`${MINI_CIRCUMFERENCE}`}
                  strokeDashoffset={`${miniProgressOffset}`}
                  strokeLinecap="round"
                />
              </Svg>
              <Text style={styles.circleText}>{percentage}%</Text>
            </View>
          </View>
          <View style={styles.goalDivider} />
          <View style={styles.goalDetailRow}>
            <Text style={styles.goalDetailLabel}>Épargné</Text>
            <Text style={styles.goalDetailValue}>{detail.saved.toLocaleString('fr-FR')} F</Text>
          </View>
          <View style={styles.goalDetailRow}>
            <Text style={styles.goalDetailLabel}>Objectif</Text>
            <Text style={styles.goalDetailValue}>{detail.target.toLocaleString('fr-FR')} F</Text>
          </View>
        </View>

        <Text style={styles.label}>Montant à ajouter</Text>
        <View style={styles.amountInputRow}>
          <TextInput
            style={styles.amountInput}
            value={addAmount}
            onChangeText={setAddAmount}
            placeholder="Entrez le montant"
            placeholderTextColor={Colors.gray[400]}
            keyboardType="number-pad"
          />
          <Text style={styles.unit}>FCFA</Text>
        </View>

        {amountExceedsRemaining ? (
          <Text style={styles.inlineError}>
            Le montant ne peut pas dépasser {detail.remaining.toLocaleString('fr-FR')} F restants.
          </Text>
        ) : null}

        <Text style={styles.quickLabel}>Montants rapides</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.quickScroll}
          contentContainerStyle={styles.quickRow}
        >
          {quickAmounts.map((a) => (
            <AnimatedPressable
              key={a}
              style={styles.quickChip}
              onPress={() => setAddAmount(String(Math.min(a, detail.remaining)))}
            >
              <Text style={styles.quickChipText}>{a.toLocaleString('fr-FR')} F</Text>
            </AnimatedPressable>
          ))}
        </ScrollView>

        {detail.remaining > 0 ? (
          <AnimatedPressable
            style={styles.completeButton}
            onPress={() => setAddAmount(String(detail.remaining))}
          >
            <Text style={styles.completeLabel}>Compléter l&apos;objectif</Text>
            <Text style={styles.completeValue}>{detail.remaining.toLocaleString('fr-FR')} F</Text>
          </AnimatedPressable>
        ) : null}

        {preview ? (
          <View style={styles.progressCard}>
            <View style={styles.progressTop}>
              <View style={styles.progressIcon}>
                <Feather name="trending-up" size={20} color={Colors.success} />
              </View>
              <View>
                <Text style={styles.progressLabel}>Nouvelle progression</Text>
                <Text style={styles.progressPercent}>{preview.newPercentage}%</Text>
              </View>
            </View>
            <View style={styles.progressDetailRow}>
              <Text style={styles.progressDetailLabel}>Nouveau total</Text>
              <Text style={styles.progressDetailValue}>
                {preview.newTotal.toLocaleString('fr-FR')} F
              </Text>
            </View>
            <View style={styles.progressDetailRow}>
              <Text style={styles.progressDetailLabel}>Reste à épargner</Text>
              <Text style={styles.progressDetailRemaining}>
                {preview.newRemaining.toLocaleString('fr-FR')} F
              </Text>
            </View>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${preview.newPercentage}%` }]} />
            </View>
            {preview.newPercentage === 100 ? (
              <View style={styles.celebrationRow}>
                <Text style={{ fontSize: 24 }}>🎉</Text>
                <Text style={styles.celebrationText}>Félicitations ! Objectif atteint !</Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {errorMessage ? <Text style={styles.inlineError}>{errorMessage}</Text> : null}

        <AnimatedPressable
          style={[styles.confirmButton, !canSubmit && styles.confirmDisabled]}
          disabled={!canSubmit}
          onPress={() => void handleConfirm()}
        >
          {isSubmitting ? (
            <ActivityIndicator color={Colors.white} />
          ) : (
            <Text style={[styles.confirmText, !canSubmit && { color: Colors.gray[400] }]}>
              Ajouter à mon épargne
            </Text>
          )}
        </AnimatedPressable>
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
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Theme.spacing.page,
  },
  errorText: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 16,
    color: Colors.danger,
    textAlign: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: Theme.spacing.page,
  },
  titleIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: withOpacity(Colors.success, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 28, color: Colors.gray[900] },
  subtitle: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 16,
    color: Colors.gray[600],
    paddingHorizontal: Theme.spacing.page,
    marginTop: 8,
    marginBottom: 24,
  },
  goalCard: {
    marginHorizontal: Theme.spacing.page,
    backgroundColor: withOpacity(Colors.success, 0.1),
    borderRadius: 24,
    padding: 24,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: withOpacity(Colors.success, 0.2),
  },
  goalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  goalLabel: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 12,
    color: Colors.gray[600],
    marginBottom: 4,
  },
  goalName: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 20, color: Colors.gray[900] },
  miniCircleWrap: {
    width: MINI_SIZE,
    height: MINI_SIZE,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  circleText: {
    position: 'absolute',
    fontFamily: Fonts.spaceGrotesk.bold,
    fontSize: 14,
    color: Colors.success,
  },
  goalDivider: {
    height: 1,
    backgroundColor: withOpacity(Colors.success, 0.2),
    marginVertical: 16,
  },
  goalDetailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  goalDetailLabel: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[600] },
  goalDetailValue: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.gray[900] },
  label: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 14,
    color: Colors.gray[700],
    paddingHorizontal: Theme.spacing.page,
    marginBottom: 8,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Colors.gray[50],
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    marginBottom: 8,
  },
  amountInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 20,
    fontFamily: Fonts.spaceGrotesk.bold,
    fontSize: 24,
    color: Colors.gray[900],
  },
  unit: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 14,
    color: Colors.gray[500],
    paddingRight: 16,
  },
  inlineError: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 13,
    color: Colors.danger,
    paddingHorizontal: Theme.spacing.page,
    marginBottom: 12,
  },
  quickLabel: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 12,
    color: Colors.gray[600],
    paddingHorizontal: Theme.spacing.page,
    marginBottom: 8,
  },
  quickScroll: { marginBottom: 16 },
  quickRow: { paddingHorizontal: Theme.spacing.page, gap: 8 },
  quickChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: Theme.screen.surface,
    borderWidth: 2,
    borderColor: Colors.gray[200],
  },
  quickChipText: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[700] },
  completeButton: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: Theme.spacing.page,
    backgroundColor: withOpacity(Colors.success, 0.1),
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: withOpacity(Colors.success, 0.2),
    marginBottom: 24,
  },
  completeLabel: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[700] },
  completeValue: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 14, color: Colors.success },
  progressCard: {
    marginHorizontal: Theme.spacing.page,
    backgroundColor: withOpacity(Colors.success, 0.1),
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: withOpacity(Colors.success, 0.2),
  },
  progressTop: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  progressIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: withOpacity(Colors.success, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressLabel: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[600] },
  progressPercent: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 24, color: Colors.success },
  progressDetailRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressDetailLabel: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    color: Colors.gray[600],
  },
  progressDetailValue: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.gray[900] },
  progressDetailRemaining: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 14,
    color: Colors.brand,
  },
  progressBar: { height: 8, backgroundColor: Colors.gray[200], borderRadius: 4, marginTop: 8 },
  progressFill: { height: 8, backgroundColor: Colors.success, borderRadius: 4 },
  celebrationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Theme.screen.surface,
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
  },
  celebrationText: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.success },
  confirmButton: {
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Colors.success,
    paddingVertical: 20,
    borderRadius: 16,
    alignItems: 'center',
  },
  confirmDisabled: { backgroundColor: Colors.gray[200] },
  confirmText: { fontFamily: Fonts.outfit.medium, fontSize: 18, color: Colors.white },
});
