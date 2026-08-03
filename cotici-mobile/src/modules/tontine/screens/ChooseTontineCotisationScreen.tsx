import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { AnimatedPressable } from '@/shared/ui';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';
import { parseTurn } from '@/shared/api';
import { useTontines } from '@/modules/tontine/hooks/useTontines';

export default function ChooseTontineCotisationScreen() {
  const router = useRouter();
  const { tontines, loading, error } = useTontines();
  const cotisable = tontines.filter((t) => t.tourCourant != null);

  const handleSelect = (tontine: (typeof cotisable)[number]) => {
    const { current } = parseTurn(tontine.turn);
    router.push({
      pathname: '/make-deposit',
      params: {
        tontineId: tontine.id,
        tontineName: tontine.name,
        turn: String(current),
        amount: String(tontine.cotisationAmount),
      },
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <AnimatedPressable style={styles.backButton} onPress={() => router.back()}>
          <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>Choisir une tontine</Text>
        <View style={{ width: 40 }} />
      </View>

      <Text style={styles.subtitle}>
        Sélectionnez le groupe pour lequel vous souhaitez régler votre cotisation
      </Text>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
      >
        {loading ? <ActivityIndicator color={Colors.brand} style={styles.loader} /> : null}

        {!loading && error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : null}

        {!loading && !error && cotisable.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="users" size={40} color={Colors.gray[300]} />
            <Text style={styles.emptyTitle}>Aucune tontine active</Text>
            <Text style={styles.emptySub}>
              Aucun tour en cours. L&apos;administrateur doit démarrer le cycle.
            </Text>
            <AnimatedPressable
              style={styles.emptyCta}
              onPress={() => router.push('/create-classic-tontine')}
            >
              <Text style={styles.emptyCtaText}>Créer une tontine</Text>
            </AnimatedPressable>
          </View>
        ) : null}

        {cotisable.map((tontine) => {
          const { current, total } = parseTurn(tontine.turn);
          return (
            <AnimatedPressable
              key={tontine.id}
              style={styles.card}
              onPress={() => handleSelect(tontine)}
              accessibilityRole="button"
              accessibilityLabel={`Payer la cotisation pour ${tontine.name}`}
            >
              <View style={styles.cardTop}>
                <View style={styles.cardIcon}>
                  <Feather name="users" size={22} color={Colors.brand} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tontineName}>{tontine.name}</Text>
                  <Text style={styles.tontineMeta}>
                    {tontine.members}/{tontine.nombreMax} membres · Tour {current}/{total}
                  </Text>
                </View>
                <Feather name="chevron-right" size={22} color={Colors.gray[400]} />
              </View>
              <View style={styles.cardBottom}>
                <View>
                  <Text style={styles.amountLabel}>Cotisation à payer</Text>
                  <Text style={styles.amountValue}>
                    {tontine.cotisationAmount.toLocaleString('fr-FR')} FCFA
                  </Text>
                </View>
              </View>
            </AnimatedPressable>
          );
        })}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.screen.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Theme.spacing.page,
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 18, color: Colors.gray[900] },
  subtitle: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    color: Colors.gray[600],
    paddingHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.lg,
    lineHeight: 20,
  },
  scroll: { paddingHorizontal: Theme.spacing.page, paddingBottom: 40 },
  loader: { marginVertical: 24 },
  errorText: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    color: Colors.danger,
    textAlign: 'center',
    marginBottom: 16,
  },
  empty: { alignItems: 'center', paddingVertical: 48, gap: 12 },
  emptyTitle: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 18, color: Colors.gray[800] },
  emptySub: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    color: Colors.gray[500],
    textAlign: 'center',
    paddingHorizontal: 24,
  },
  emptyCta: {
    marginTop: 8,
    backgroundColor: Colors.brand,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: Theme.radius.md,
  },
  emptyCtaText: { fontFamily: Fonts.outfit.medium, fontSize: 15, color: Colors.white },
  card: {
    backgroundColor: Theme.screen.surface,
    borderRadius: Theme.radius.lg,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    ...Theme.shadow.card,
  },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: Theme.spacing.md, marginBottom: 12 },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: Theme.radius.sm,
    backgroundColor: withOpacity(Colors.brand, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  tontineName: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 17, color: Colors.gray[900], marginBottom: 4 },
  tontineMeta: { fontFamily: Fonts.outfit.regular, fontSize: 13, color: Colors.gray[500] },
  cardBottom: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: Colors.gray[100],
  },
  amountLabel: { fontFamily: Fonts.outfit.regular, fontSize: 11, color: Colors.gray[500], marginBottom: 2 },
  amountValue: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 18, color: Colors.gray[900] },
});
