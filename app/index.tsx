import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/constants/Colors';
import { Fonts } from '@/constants/Fonts';
import { Theme } from '@/constants/Theme';

export default function WelcomeScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.logo}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoLetter}>C</Text>
        </View>
        <Text style={styles.logoText}>COTICI</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.illustrationContainer}>
          <View style={styles.decorCircle1} />
          <View style={styles.decorCircle2} />
          <View style={styles.placeholderImage}>
            <Feather name="users" size={64} color={Colors.brand} />
          </View>
        </View>

        <Text style={styles.headline}>
          Votre Tontine,{'\n'}Sécurisée & Digitale
        </Text>

        <View style={styles.indicators}>
          <View style={styles.indicator}>
            <View style={styles.indicatorIcon}>
              <Feather name="shield" size={24} color={Colors.brand} />
            </View>
            <Text style={styles.indicatorText}>Sécurisé</Text>
          </View>
          <View style={styles.indicator}>
            <View style={styles.indicatorIcon}>
              <Feather name="users" size={24} color={Colors.brand} />
            </View>
            <Text style={styles.indicatorText}>Communautaire</Text>
          </View>
          <View style={styles.indicator}>
            <View style={styles.indicatorIcon}>
              <Feather name="trending-up" size={24} color={Colors.brand} />
            </View>
            <Text style={styles.indicatorText}>Rentable</Text>
          </View>
        </View>
      </View>

      <View style={styles.bottom}>
        <TouchableOpacity
          style={styles.primaryButton}
          onPress={() => router.push('/create-account')}
        >
          <Text style={styles.primaryButtonText}>Créer un compte</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryButton}
          onPress={() => router.push('/login')}
        >
          <Text style={styles.secondaryButtonText}>Se connecter</Text>
        </TouchableOpacity>
        <Text style={styles.terms}>
          En continuant, vous acceptez nos conditions d'utilisation
        </Text>
        <TouchableOpacity onPress={() => router.push('/(tabs)')}>
          <Text style={styles.demoLink}>Accès rapide dashboard →</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.screen.bg, paddingHorizontal: Theme.spacing.page },
  logo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingTop: 16 },
  logoCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.brand, alignItems: 'center', justifyContent: 'center' },
  logoLetter: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 20, color: Colors.white },
  logoText: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 24, color: Colors.brand },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  illustrationContainer: { width: '100%', marginBottom: 32, position: 'relative', alignItems: 'center' },
  decorCircle1: { position: 'absolute', top: -16, right: 32, width: 64, height: 64, borderRadius: 32, backgroundColor: withOpacity(Colors.brand, 0.1) },
  decorCircle2: { position: 'absolute', bottom: 16, left: 32, width: 48, height: 48, borderRadius: 24, backgroundColor: withOpacity(Colors.success, 0.1) },
  placeholderImage: { width: 200, height: 200, borderRadius: 100, backgroundColor: withOpacity(Colors.brand, 0.06), alignItems: 'center', justifyContent: 'center' },
  headline: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 28, textAlign: 'center', color: Colors.gray[900], marginBottom: 24, lineHeight: 38 },
  indicators: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24 },
  indicator: { alignItems: 'center', gap: 4 },
  indicatorIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: withOpacity(Colors.brand, 0.1), alignItems: 'center', justifyContent: 'center' },
  indicatorText: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[600] },
  bottom: { paddingBottom: 16, gap: 12 },
  primaryButton: { backgroundColor: Colors.brand, paddingVertical: 16, paddingHorizontal: Theme.spacing.page, borderRadius: 16, alignItems: 'center' },
  primaryButtonText: { fontFamily: Fonts.outfit.medium, fontSize: 16, color: Colors.white },
  secondaryButton: { backgroundColor: Theme.screen.surface, paddingVertical: 16, paddingHorizontal: Theme.spacing.page, borderRadius: 16, borderWidth: 2, borderColor: Colors.brand, alignItems: 'center' },
  secondaryButtonText: { fontFamily: Fonts.outfit.medium, fontSize: 16, color: Colors.brand },
  terms: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[400], textAlign: 'center' },
  demoLink: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[300], textAlign: 'center' },
});
