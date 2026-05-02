import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';

const configs: Record<string, { icon: keyof typeof Feather.glyphMap; color: string; title: string; subtitle: string; buttonLabel: string; buttonRoute: string }> = {
  payment: {
    icon: 'check-circle',
    color: Colors.success,
    title: 'Paiement effectué !',
    subtitle: 'Votre cotisation a été enregistrée avec succès.',
    buttonLabel: 'Retour à la tontine',
    buttonRoute: '/(tabs)/tontine',
  },
  deposit: {
    icon: 'check-circle',
    color: Colors.success,
    title: 'Dépôt réussi !',
    subtitle: 'Votre solde a été rechargé avec succès.',
    buttonLabel: 'Retour à l\'accueil',
    buttonRoute: '/(tabs)',
  },
  withdrawal: {
    icon: 'check-circle',
    color: Colors.success,
    title: 'Retrait demandé !',
    subtitle: 'Les fonds seront envoyés sur votre compte Mobile Money sous peu.',
    buttonLabel: 'Retour à l\'accueil',
    buttonRoute: '/(tabs)',
  },
  savings: {
    icon: 'trending-up',
    color: Colors.success,
    title: 'Épargne ajoutée !',
    subtitle: 'Votre épargne a été mise à jour avec succès.',
    buttonLabel: 'Voir mon épargne',
    buttonRoute: '/(tabs)/savings',
  },
  'create-tontine': {
    icon: 'users',
    color: Colors.brand,
    title: 'Tontine créée !',
    subtitle: 'Vous pouvez maintenant inviter des membres.',
    buttonLabel: 'Voir mes tontines',
    buttonRoute: '/(tabs)/tontine',
  },
  'create-goal': {
    icon: 'target',
    color: Colors.success,
    title: 'Objectif créé !',
    subtitle: 'Commencez à épargner dès maintenant.',
    buttonLabel: 'Voir mon épargne',
    buttonRoute: '/(tabs)/savings',
  },
  'create-solidarity': {
    icon: 'heart',
    color: Colors.brand,
    title: 'Groupe de soutien créé !',
    subtitle: 'Partagez le lien pour inviter les participants.',
    buttonLabel: 'Retour à l\'accueil',
    buttonRoute: '/(tabs)',
  },
  'create-fund': {
    icon: 'home',
    color: Colors.success,
    title: 'Cagnotte créée !',
    subtitle: 'Partagez le lien de collecte avec votre communauté.',
    buttonLabel: 'Retour à l\'accueil',
    buttonRoute: '/(tabs)',
  },
  'aid-request': {
    icon: 'send',
    color: Colors.brand,
    title: 'Demande envoyée !',
    subtitle: 'Le groupe sera notifié de votre demande d\'aide.',
    buttonLabel: 'Retour',
    buttonRoute: '/(tabs)',
  },
};

export default function SuccessScreen() {
  const router = useRouter();
  const { type } = useLocalSearchParams<{ type: string }>();
  const config = configs[type ?? ''] ?? configs.deposit;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={[styles.iconCircle, { backgroundColor: withOpacity(config.color, 0.1) }]}>
          <Feather name={config.icon} size={64} color={config.color} />
        </View>
        <Text style={styles.title}>{config.title}</Text>
        <Text style={styles.subtitle}>{config.subtitle}</Text>
      </View>

      <View style={styles.bottom}>
        <TouchableOpacity
          style={[styles.primaryButton, { backgroundColor: config.color }]}
          onPress={() => router.replace(config.buttonRoute as any)}
        >
          <Text style={styles.primaryButtonText}>{config.buttonLabel}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={() => router.replace('/(tabs)')}>
          <Text style={styles.secondaryButtonText}>Retour à l'accueil</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.screen.bg, paddingHorizontal: Theme.spacing.page },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  iconCircle: { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center', marginBottom: 32 },
  title: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 28, color: Colors.gray[900], textAlign: 'center', marginBottom: 12 },
  subtitle: { fontFamily: Fonts.outfit.regular, fontSize: 16, color: Colors.gray[500], textAlign: 'center', lineHeight: 24, paddingHorizontal: 16 },
  bottom: { paddingBottom: 32, gap: 12 },
  primaryButton: { paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
  primaryButtonText: { fontFamily: Fonts.outfit.medium, fontSize: 16, color: Colors.white },
  secondaryButton: { paddingVertical: 16, borderRadius: 16, alignItems: 'center' },
  secondaryButtonText: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[500] },
});
