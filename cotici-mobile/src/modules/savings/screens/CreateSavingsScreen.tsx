import { 
  View,
  Text,
  ScrollView,
  StyleSheet,
 } from 'react-native';
import { AnimatedPressable } from '@/shared/ui';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';

const savingsOptions = [
  { id: 'tontine', icon: 'refresh-cw' as const, color: Colors.brand, title: 'Tontine de Groupe', subtitle: 'Cotisez ensemble, ramassez à tour de rôle.', path: '/create-classic-tontine' as const },
  {
    id: 'epargne',
    materialIcon: 'piggy-bank-outline' as const,
    color: Colors.success,
    title: 'Mon Épargne',
    subtitle: 'Économisez seul pour vos envies.',
    path: '/create-personal-goal' as const,
  },
  { id: 'solidaire', icon: 'heart' as const, color: Colors.brand, title: 'Tontine Solidaire', subtitle: 'Cotisez pour aider une personne dans le besoin.', path: '/create-solidarity-tontine' as const },
  { id: 'asso', icon: 'home' as const, color: Colors.success, title: 'Cagnotte Association', subtitle: 'Récoltez des fonds pour une cause commune.', path: '/create-association-fund' as const },
];

export default function CreateSavingsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <AnimatedPressable style={styles.backButton} onPress={() => router.back()}>
            <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
          </AnimatedPressable>
        </View>

        <View style={styles.heroBlock}>
          <View style={styles.heroIconWrap}>
            <Feather name="folder-plus" size={28} color={Colors.brand} />
          </View>
          <Text style={styles.title}>Nouveau projet</Text>
          <Text style={styles.subtitle}>
            {"Choisissez le type d'épargne ou de collecte qui vous correspond"}
          </Text>
        </View>

        <Text style={styles.sectionEyebrow}>Types de projet</Text>

        {savingsOptions.map((opt) => (
          <AnimatedPressable
            key={opt.id}
            style={styles.optionCard}
            onPress={() => router.push(opt.path)} >
            <View style={[styles.optionIcon, { backgroundColor: withOpacity(opt.color, 0.12) }]}>
              {'materialIcon' in opt ? (
                <MaterialCommunityIcons name={opt.materialIcon} size={28} color={opt.color} />
              ) : (
                <Feather name={opt.icon} size={28} color={opt.color} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.optionTitle}>{opt.title}</Text>
              <Text style={styles.optionSubtitle}>{opt.subtitle}</Text>
            </View>
            <Feather name="chevron-right" size={22} color={Colors.gray[400]} />
          </AnimatedPressable>
        ))}

        

        
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
    marginBottom: Theme.spacing.lg,
    alignItems: 'center',
  },
  heroIconWrap: {
    width: 72,
    height: 72,
    borderRadius: Theme.radius.lg,
    backgroundColor: withOpacity(Colors.brand, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Theme.spacing.lg,
  },
  title: {
    fontFamily: Fonts.spaceGrotesk.bold,
    fontSize: 28,
    color: Colors.gray[900],
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 16,
    color: Colors.gray[600],
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: Theme.spacing.sm,
  },
  introCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Theme.spacing.md,
    marginHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.xl,
    padding: Theme.spacing.lg,
    backgroundColor: withOpacity(Colors.brand, 0.06),
    borderRadius: Theme.radius.lg,
    borderWidth: 1,
    borderColor: withOpacity(Colors.brand, 0.18),
  },
  introText: {
    flex: 1,
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    color: Colors.gray[700],
    lineHeight: 21,
  },
  sectionEyebrow: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 13,
    color: Colors.gray[500],
    paddingHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.md,
    letterSpacing: 0.2,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Theme.spacing.md,
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Theme.screen.surface,
    borderRadius: Theme.radius.lg,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    ...Theme.shadow.card,
  },
  optionIcon: {
    width: 56,
    height: 56,
    borderRadius: Theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTitle: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 17, color: Colors.gray[900], marginBottom: 4 },
  optionSubtitle: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[600], lineHeight: 20 },
  tipCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Theme.spacing.md,
    marginHorizontal: Theme.spacing.page,
    marginTop: Theme.spacing.md,
    marginBottom: Theme.spacing.xl,
    padding: Theme.spacing.lg,
    backgroundColor: withOpacity(Colors.info, 0.08),
    borderRadius: Theme.radius.lg,
    borderWidth: 1,
    borderColor: withOpacity(Colors.info, 0.2),
    ...Theme.shadow.soft,
  },
  tipIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: withOpacity(Colors.info, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipTitle: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.info, marginBottom: 6 },
  tipText: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[700], lineHeight: 21 },
  whySectionTitle: {
    fontFamily: Fonts.spaceGrotesk.bold,
    fontSize: 18,
    color: Colors.gray[900],
    paddingHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.md,
  },
  whyCard: {
    marginHorizontal: Theme.spacing.page,
    borderRadius: Theme.radius.md,
    padding: Theme.spacing.lg,
    borderLeftWidth: 4,
    marginBottom: Theme.spacing.md,
    backgroundColor: Theme.screen.surface,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    ...Theme.shadow.soft,
  },
  whyCardTitle: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.gray[900], marginBottom: 4 },
  whyCardText: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[600], lineHeight: 20 },
});
