import { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { AnimatedPressable } from '@/shared/ui';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';
import { usePushPriming } from '@/modules/notifications/hooks';
import { PushPrimingModal } from '@/modules/notifications/components/PushPrimingModal';

/** Points de « priming » retenus : la première action de valeur de
 * l'utilisateur — créer une tontine, créer un objectif d'épargne, ou
 * effectuer une première cotisation (type `payment`, écran de succès après
 * paiement). C'est le moment où la valeur de la notification ("on va vous
 * prévenir de vos échéances") est la plus évidente pour l'utilisateur, donc
 * le meilleur taux d'acceptation attendu — bien plus qu'au premier
 * lancement de l'app. Le flag `hasShownPushPriming` garantit un affichage
 * unique, quel que soit le premier type de succès rencontré. */
const PRIMING_ELIGIBLE_TYPES = new Set(['create-tontine', 'create-goal', 'payment']);

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
    title: 'Retrait réussi !',
    subtitle: 'Votre solde a été mis à jour et le transfert Mobile Money a été confirmé.',
    buttonLabel: 'Retour à l\'accueil',
    buttonRoute: '/(tabs)',
  },
  'withdrawal-pending': {
    icon: 'clock',
    color: Colors.info,
    title: 'Retrait en cours',
    subtitle:
      'Votre solde a déjà été débité. Le transfert Mobile Money est en cours de traitement et peut prendre quelques minutes. En cas d\'échec, le montant vous sera automatiquement recrédité.',
    buttonLabel: 'Retour à l\'accueil',
    buttonRoute: '/(tabs)',
  },
  'deposit-pending': {
    icon: 'clock',
    color: Colors.info,
    title: 'Paiement en cours de confirmation',
    subtitle:
      'Votre paiement Mobile Money est en cours de traitement. Votre solde sera mis à jour dès que le paiement sera confirmé, généralement en quelques minutes.',
    buttonLabel: 'Retour à l\'accueil',
    buttonRoute: '/(tabs)',
  },
  savings: {
    icon: 'trending-up',
    color: Colors.success,
    title: 'Montant ajoutée !',
    subtitle: 'Votre épargne a été mise à jour avec succès.',
    buttonLabel: 'Voir mon épargne',
    buttonRoute: '/(tabs)/savings',
  },
  'savings-withdraw': {
    icon: 'arrow-down-left',
    color: Colors.success,
    title: 'Épargne retirée !',
    subtitle: 'Le montant a été crédité sur votre solde COTICI disponible.',
    buttonLabel: "Retour à l'accueil",
    buttonRoute: '/(tabs)',
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
  'solidarity-contribution': {
    icon: 'heart',
    color: Colors.brand,
    title: 'Merci pour votre soutien !',
    subtitle: 'Votre participation a été enregistrée avec succès.',
    buttonLabel: 'Voir la collecte',
    buttonRoute: '/solidarity-collect/[id]',
  },
  'cagnotte-contribution': {
    icon: 'home',
    color: Colors.success,
    title: 'Merci pour votre participation !',
    subtitle: 'Votre contribution à la cagnotte a été enregistrée avec succès.',
    buttonLabel: 'Voir la cagnotte',
    buttonRoute: '/cagnotte-collect/[id]',
  },
};

export default function SuccessScreen() {
  const router = useRouter();
  const { type, collectId } = useLocalSearchParams<{ type: string; collectId?: string }>();
  const config = configs[type ?? ''] ?? configs.deposit;
  const { visible: primingVisible, loading: primingLoading, maybeShowPriming, handleActivate, handleDismiss } =
    usePushPriming();

  useEffect(() => {
    if (type && PRIMING_ELIGIBLE_TYPES.has(type)) {
      void maybeShowPriming();
    }
    // Une seule fois au montage de cet écran de succès.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type]);

  const handlePrimary = () => {
    if (type === 'solidarity-contribution' && typeof collectId === 'string' && collectId) {
      router.replace({
        pathname: '/solidarity-collect/[id]',
        params: { id: collectId },
      });
      return;
    }
    if (type === 'cagnotte-contribution' && typeof collectId === 'string' && collectId) {
      router.replace({
        pathname: '/cagnotte-collect/[id]',
        params: { id: collectId },
      });
      return;
    }
    router.replace(config.buttonRoute as '/(tabs)');
  };

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
        <AnimatedPressable
          style={[styles.primaryButton, { backgroundColor: config.color }]}
          onPress={handlePrimary}
        >
          <Text style={styles.primaryButtonText}>{config.buttonLabel}</Text>
        </AnimatedPressable>
        <AnimatedPressable style={styles.secondaryButton} onPress={() => router.replace('/(tabs)')}>
        </AnimatedPressable>
      </View>

      <PushPrimingModal
        visible={primingVisible}
        loading={primingLoading}
        onActivate={() => void handleActivate()}
        onDismiss={handleDismiss}
      />
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
