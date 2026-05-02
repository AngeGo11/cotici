import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';

const SECTIONS = [
  {
    title: '1. Objet',
    body:
      "COTICI est une application de gestion de tontines et d’épargne de groupe. En créant un compte ou en utilisant l’application, vous acceptez les présentes conditions d’utilisation et notre politique de confidentialité.",
  },
  {
    title: '2. Compte et sécurité',
    body:
      'Vous êtes responsable de la confidentialité de votre téléphone, de votre code PIN et de vos moyens de paiement. Toute opération effectuée depuis votre compte est réputée faite par vous, sauf fraude dûment signalée.',
  },
  {
    title: '3. Tontines et fonds',
    body:
      "Les règles de chaque tontine (montants, tours, solidarité) sont définies par le groupe et le règlement interne. COTICI met à disposition un outil de suivi ; la relation contractuelle reste entre les membres, dans le respect de la loi applicable.",
  },
  {
    title: '4. Données personnelles',
    body:
      'Nous traitons votre numéro de téléphone, votre identité et les données d’usage pour assurer le service, la sécurité et l’assistance. Vous pouvez demander l’accès ou la rectification de vos données en contactant le support.',
  },
  {
    title: '5. Limitation',
    body:
      "COTICI s'efforce d'assurer la disponibilité du service. Nous ne saurions être tenus responsables des retards imputables aux opérateurs de paiement ou à des cas de force majeure.",
  },
] as const;

export default function TermsScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.85}>
          <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Conditions & confidentialité</Text>
        <View style={styles.backButton} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.meta}>Dernière mise à jour : avril 2026 · Version app 1.0.2</Text>
        {SECTIONS.map((s) => (
          <View key={s.title} style={styles.block}>
            <Text style={styles.blockTitle}>{s.title}</Text>
            <Text style={styles.blockBody}>{s.body}</Text>
          </View>
        ))}
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
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: Theme.screen.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 16, color: Colors.gray[900], flex: 1, textAlign: 'center' },
  scroll: { paddingHorizontal: Theme.spacing.page, paddingBottom: 32 },
  meta: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500], marginBottom: Theme.spacing.lg },
  block: { marginBottom: Theme.spacing.xl },
  blockTitle: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 17, color: Colors.gray[900], marginBottom: 8 },
  blockBody: { fontFamily: Fonts.outfit.regular, fontSize: 15, color: Colors.gray[600], lineHeight: 24 },
});
