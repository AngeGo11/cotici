import { useState, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Image,
  Alert,
 } from 'react-native';
import { AnimatedPressable } from '@/shared/ui';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';

/** Le flux Expo LocalAuthentication n'est pas encore implémenté (dépendance non
 * installée) : on masque le bouton biométrique pour éviter une fausse affordance. */
const BIOMETRIC_LOGIN_ENABLED = false;

export default function LoginScreen() {
  const router = useRouter();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [pin, setPin] = useState(['', '', '', '']);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const pinRefs = useRef<(TextInput | null)[]>([]);

  const handlePinChange = (index: number, value: string) => {
    if (value.length > 1) return;
    if (value && !/^\d$/.test(value)) return;
    const newPin = [...pin];
    newPin[index] = value;
    setPin(newPin);
    if (value && index < 3) pinRefs.current[index + 1]?.focus();
  };

  const handlePinKeyPress = (index: number, key: string) => {
    if (key === 'Backspace' && !pin[index] && index > 0) pinRefs.current[index - 1]?.focus();
  };

  const normalizePhoneToUsername = (value: string) => {
    const digits = value.replace(/\D/g, '');
    if (digits.startsWith('225') && digits.length > 10) return digits.slice(3);
    return digits;
  };

  const handleLogin = async () => {
    if (isSubmitting) return;

    const username = normalizePhoneToUsername(phoneNumber);
    const password = pin.join('');
    if (!username || password.length !== 4) {
      setErrorMessage('Numéro ou code PIN invalide.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const proxyBaseUrl = process.env.EXPO_PUBLIC_PROXY_URL || 'http://127.0.0.1:8001';
      const response = await fetch(`${proxyBaseUrl}/api/request-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, purpose: 'login' }),
      });

      const data = await response.json();
      if (!response.ok) {
        const detail =
          typeof data?.detail === 'string'
            ? data.detail
            : 'Connexion impossible. Vérifie ton numéro et ton PIN.';
        setErrorMessage(detail);
        return;
      }

      router.push({
        pathname: '/otp',
        params: {
          challengeId: String(data?.challenge_id || ''),
          phoneHint: String(data?.phone_hint || ''),
        },
      });
    } catch {
      setErrorMessage('Connexion impossible. Vérifiez votre connexion internet et réessayez.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <AnimatedPressable style={styles.backButton} onPress={() => router.back()}>
          <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
        </AnimatedPressable>
        <View style={styles.headerLogo}>
          <Image source={require('../../../../assets/logo_cotici.png')} style={styles.logoImage} resizeMode="contain" />
          <Text style={styles.logoStyle}>COTICI</Text>
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.form}>
        <Text style={styles.title}>Connexion</Text>
        <Text style={styles.subtitle}>Accédez à votre compte COTICI</Text>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Numéro de téléphone</Text>
          <View style={styles.phoneInput}>
            <Text style={styles.flag}>🇨🇮</Text>
            <Text style={styles.prefix}>+225</Text>
            <View style={styles.divider} />
            <TextInput
              style={styles.phoneField}
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              placeholder="07 XX XX XX XX"
              placeholderTextColor={Colors.gray[400]}
              keyboardType="phone-pad"
            />
          </View>
        </View>

        <View style={styles.fieldGroup}>
          <Text style={styles.label}>Code PIN</Text>
          <View style={styles.pinRow}>
            {pin.map((digit, index) => (
              <TextInput
                key={index}
                ref={(el) => { pinRefs.current[index] = el; }}
                style={styles.pinInput}
                value={digit}
                onChangeText={(v) => handlePinChange(index, v)}
                onKeyPress={({ nativeEvent }) => handlePinKeyPress(index, nativeEvent.key)}
                keyboardType="number-pad"
                maxLength={1}
                secureTextEntry
              />
            ))}
          </View>
        </View>

        <AnimatedPressable style={[styles.loginButton, isSubmitting && styles.loginButtonDisabled]} onPress={handleLogin} disabled={isSubmitting}>
          <Text style={styles.loginButtonText}>{isSubmitting ? 'Connexion...' : 'Connexion'}</Text>
        </AnimatedPressable>
        {!!errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}

        <AnimatedPressable
          onPress={() =>
            Alert.alert(
              'Bientôt disponible',
              'La réinitialisation du code PIN sera bientôt disponible. Contactez le support si vous êtes bloqué·e.'
            )
          }
        >
          <Text style={styles.forgotPin}>Code PIN oublié ?</Text>
        </AnimatedPressable>

        <AnimatedPressable onPress={() => router.push('/create-account')} style={styles.createAccountWrap}>
          <Text style={styles.createAccountText}>
            Pas encore de compte ? <Text style={styles.createAccountBold}>Créer un compte</Text>
          </Text>
        </AnimatedPressable>
      </View>

      {/* Authentification biométrique : masquée tant que le flux Expo LocalAuthentication
          n'est pas implémenté (dépendance non installée). Ne pas ré-afficher ce bloc
          sans onPress fonctionnel — cf. audit UX. */}
      {BIOMETRIC_LOGIN_ENABLED ? (
        <View style={styles.biometric}>
          <Text style={styles.biometricLabel}>Ou connectez-vous avec</Text>
          <AnimatedPressable style={styles.biometricButton}>
            <Feather name="smartphone" size={32} color={Colors.brand} />
          </AnimatedPressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.screen.bg, paddingHorizontal: Theme.spacing.page },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16 },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.gray[100], alignItems: 'center', justifyContent: 'center' },
  headerLogo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  logoImage: { width: 38, height: 38 },
  logoStyle: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 18},
  headerTitle: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 18, color: Colors.brand },
  form: { flex: 1, paddingTop: 16 },
  title: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 28, color: Colors.gray[900], marginBottom: 8 },
  subtitle: { fontFamily: Fonts.outfit.regular, fontSize: 16, color: Colors.gray[500], marginBottom: 32 },
  fieldGroup: { marginBottom: 24 },
  label: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[700], marginBottom: 8 },
  phoneInput: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.gray[50], borderRadius: 16, paddingHorizontal: 16, height: 56, gap: 8 },
  flag: { fontSize: 24 },
  prefix: { fontFamily: Fonts.outfit.regular, fontSize: 16, color: Colors.gray[600] },
  divider: { width: 1, height: 24, backgroundColor: Colors.gray[300], marginLeft: 4 },
  phoneField: { flex: 1, fontFamily: Fonts.outfit.regular, fontSize: 16, color: Colors.gray[900], paddingLeft: 8 },
  pinRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  pinInput: { flex: 1, height: 64, backgroundColor: Colors.gray[50], borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[300], fontFamily: Fonts.outfit.regular, fontSize: 24, textAlign: 'center', color: Colors.gray[900] },
  loginButton: { backgroundColor: Colors.brand, paddingVertical: 16, borderRadius: 16, alignItems: 'center', marginBottom: 16 },
  loginButtonDisabled: { opacity: 0.65 },
  loginButtonText: { fontFamily: Fonts.outfit.medium, fontSize: 16, color: Colors.white },
  errorText: { fontFamily: Fonts.outfit.regular, fontSize: 13, color: Colors.danger, textAlign: 'center', marginBottom: 8 },
  forgotPin: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.accent, textAlign: 'center', marginBottom: 12 },
  createAccountWrap: { marginBottom: 16 },
  createAccountText: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[500], textAlign: 'center' },
  createAccountBold: { color: Colors.accent, fontFamily: Fonts.outfit.medium },
  biometric: { alignItems: 'center', gap: 12, paddingBottom: 32 },
  biometricLabel: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500] },
  biometricButton: { width: 64, height: 64, borderRadius: 32, backgroundColor: withOpacity(Colors.brand, 0.1), alignItems: 'center', justifyContent: 'center' },
});
