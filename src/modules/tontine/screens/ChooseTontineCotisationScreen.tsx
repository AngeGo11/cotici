import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { AnimatedPressable } from '@/shared/ui';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';
import {
  getActiveTontinesForCotisation,
  parseTurn,
} from '@/modules/tontine/data/tontines';

export default function ChooseTontineCotisationScreen() {
  const router = useRouter();
  const tontines = getActiveTontinesForCotisation();

  const handleSelect = (tontine: (typeof tontines)[number]) => {
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
        {tontines.length === 0 ? (
          <View style={styles.empty}>
            <Feather name="users" size={40} color={Colors.gray[300]} />
            <Text style={styles.emptyTitle}>Aucune tontine active</Text>
            <Text style={styles.emptySub}>
              Rejoignez ou créez une tontine pour pouvoir payer une cotisation.
            </Text>
            <AnimatedPressable
              style={styles.emptyCta}
              onPress={() => router.push('/create-savings')}
            >
              <Text style={styles.emptyCtaText}>Créer une tontine</Text>
            </AnimatedPressable>
          </View>
        ) : (
          tontines.map((tontine) => {
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
                  <View
                    style={[
                      styles.cardIcon,
                      tontine.isSolidarity && styles.cardIconSolidarity,
                    ]}
                  >
                    <Feather
                      name={tontine.isSolidarity ? 'heart' : 'users'}
                      size={22}
                      color={Colors.brand}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tontineName}>{tontine.name}</Text>
                    <Text style={styles.tontineMeta}>
                      {tontine.members} membres · Tour {current}/{total}
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
                  <View style={styles.payChip}>
                    <Text style={styles.payChipText}>Continuer</Text>
                  </View>
                </View>
              </AnimatedPressable>
            );
          })
        )}
        <View style={{ height: 40 }} />
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
    paddingVertical: Theme.spacing.sm,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Theme.screen.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...Theme.shadow.soft,
  },
  headerTitle: {
    fontFamily: Fonts.spaceGrotesk.bold,
    fontSize: 18,
    color: Colors.gray[900],
  },
  subtitle: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    color: Colors.gray[600],
    lineHeight: 20,
    paddingHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.lg,
  },
  scroll: { paddingHorizontal: Theme.spacing.page },
  card: {
    backgroundColor: Theme.screen.surface,
    borderRadius: Theme.radius.lg,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    ...Theme.shadow.card,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.md,
    marginBottom: Theme.spacing.lg,
  },
  cardIcon: {
    width: 48,
    height: 48,
    borderRadius: Theme.radius.sm,
    backgroundColor: withOpacity(Colors.brand, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardIconSolidarity: {
    backgroundColor: withOpacity(Colors.accent, 0.12),
  },
  tontineName: {
    fontFamily: Fonts.spaceGrotesk.bold,
    fontSize: 17,
    color: Colors.gray[900],
    marginBottom: 4,
  },
  tontineMeta: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 13,
    color: Colors.gray[500],
  },
  cardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: Theme.spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.gray[100],
  },
  amountLabel: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 12,
    color: Colors.gray[500],
    marginBottom: 2,
  },
  amountValue: {
    fontFamily: Fonts.spaceGrotesk.bold,
    fontSize: 18,
    color: Colors.success,
  },
  payChip: {
    backgroundColor: withOpacity(Colors.brand, 0.1),
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Theme.radius.pill,
  },
  payChipText: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 13,
    color: Colors.brand,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: Theme.spacing.lg,
  },
  emptyTitle: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 18,
    color: Colors.gray[900],
    marginTop: Theme.spacing.lg,
    marginBottom: 8,
  },
  emptySub: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    color: Colors.gray[500],
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: Theme.spacing.xl,
  },
  emptyCta: {
    backgroundColor: Colors.brand,
    paddingHorizontal: Theme.spacing.xl,
    paddingVertical: 14,
    borderRadius: Theme.radius.md,
  },
  emptyCtaText: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 15,
    color: Colors.white,
  },
});
