import { useState, useRef, useEffect } from 'react';
import { 
  View,
  Text,
  TextInput,
  StyleSheet,
  Image,
 } from 'react-native';
import { AnimatedPressable } from '@/shared/ui';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';
import { useAuth } from '@/shared/auth';

export default function OTPScreen() {
  const router = useRouter();
  const { signIn } = useAuth();
  const params = useLocalSearchParams<{ challengeId?: string; phoneHint?: string }>();
  const challengeId = typeof params.challengeId === 'string' ? params.challengeId : '';
  const phoneHint = typeof params.phoneHint === 'string' ? params.phoneHint : '';
  const [otp, setOtp] = useState(['', '', '', '']);
  const [timer, setTimer] = useState(60);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const inputRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const proxyBaseUrl = process.env.EXPO_PUBLIC_PROXY_URL || 'http://127.0.0.1:8001';

  const verifyOtp = async (code: string) => {
    if (!challengeId || isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage('');
    try {
      const response = await fetch(`${proxyBaseUrl}/api/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challenge_id: challengeId, otp: code }),
      });
      const data = await response.json();
      if (!response.ok) {
        const detail = typeof data?.detail === 'string' ? data.detail : 'Code invalide.';
        setErrorMessage(detail);
        setOtp(['', '', '', '']);
        inputRefs.current[0]?.focus();
        return;
      }
      if (typeof data?.access !== 'string' || typeof data?.refresh !== 'string') {
        setErrorMessage('Réponse serveur invalide.');
        return;
      }
      await signIn({ access: data.access, refresh: data.refresh, user: data.user });
      router.replace('/(tabs)');
    } catch {
      setErrorMessage('Serveur inaccessible. Réessaie dans un instant.');
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (otp.every((digit) => digit !== '')) {
      void verifyOtp(otp.join(''));
    }
  }, [otp]);

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) return;
    if (value && !/^\d$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (value && index < 3) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyPress = (index: number, key: string) => {
    if (key === 'Backspace' && !otp[index] && index > 0) inputRefs.current[index - 1]?.focus();
  };

  const handleResend = () => {
    if (!challengeId || isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage('');
    fetch(`${proxyBaseUrl}/api/resend-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challenge_id: challengeId }),
    })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) {
          const detail = typeof data?.detail === 'string' ? data.detail : 'Impossible de renvoyer le code.';
          setErrorMessage(detail);
          return;
        }
        setTimer(typeof data?.expires_in === 'number' ? data.expires_in : 60);
        setOtp(['', '', '', '']);
        inputRefs.current[0]?.focus();
      })
      .catch(() => setErrorMessage('Serveur inaccessible. Réessaie plus tard.'))
      .finally(() => setIsSubmitting(false));
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <AnimatedPressable style={styles.backButton} onPress={() => router.back()}>
          <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
        </AnimatedPressable>
        <View style={styles.headerLogo}>
          <Image source={require('../../../../assets/logo_cotici.png')} style={styles.logoImage} resizeMode="contain" />
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Feather name="message-square" size={40} color={Colors.brand} />
        </View>

        <Text style={styles.title}>Vérification</Text>
        <Text style={styles.subtitle}>
          Entrez le code reçu par SMS{phoneHint ? ` sur ${phoneHint}` : ''}
        </Text>

        <View style={styles.otpRow}>
          {otp.map((digit, index) => (
            <TextInput
              key={index}
              ref={(el) => { inputRefs.current[index] = el; }}
              style={[styles.otpInput, digit ? styles.otpInputFilled : null]}
              value={digit}
              onChangeText={(v) => handleOtpChange(index, v)}
              onKeyPress={({ nativeEvent }) => handleKeyPress(index, nativeEvent.key)}
              keyboardType="number-pad"
              maxLength={1}
            />
          ))}
        </View>

        <View style={styles.timerContainer}>
          {timer > 0 ? (
            <Text style={styles.timerText}>
              Renvoyer le code dans{' '}
              <Text style={styles.timerValue}>{timer}s</Text>
            </Text>
          ) : (
            <AnimatedPressable onPress={handleResend}>
              <Text style={styles.resendText}>Renvoyer le code</Text>
            </AnimatedPressable>
          )}
        </View>
        {!!errorMessage && <Text style={styles.errorText}>{errorMessage}</Text>}
      </View>

      <Text style={styles.helpText}>
        Vous n'avez pas reçu de code ? Vérifiez votre numéro
      </Text>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.screen.bg, paddingHorizontal: Theme.spacing.page },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16 },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: Colors.gray[100], alignItems: 'center', justifyContent: 'center' },
  headerLogo: { alignItems: 'center', justifyContent: 'center' },
  logoImage: { width: 38, height: 38 },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  iconCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: withOpacity(Colors.brand, 0.1), alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  title: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 28, color: Colors.gray[900], marginBottom: 8, textAlign: 'center' },
  subtitle: { fontFamily: Fonts.outfit.regular, fontSize: 16, color: Colors.gray[500], marginBottom: 32, textAlign: 'center' },
  otpRow: { flexDirection: 'row', justifyContent: 'center', gap: 16, marginBottom: 32 },
  otpInput: { width: 64, height: 80, backgroundColor: Colors.gray[50], borderRadius: 16, borderWidth: 1, borderColor: Colors.gray[300], fontFamily: Fonts.spaceGrotesk.bold, fontSize: 28, textAlign: 'center', color: Colors.gray[900] },
  otpInputFilled: { backgroundColor: Theme.screen.surface, borderWidth: 2, borderColor: withOpacity(Colors.brand, 0.3) },
  timerContainer: { alignItems: 'center' },
  timerText: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[500] },
  timerValue: { fontFamily: Fonts.spaceGrotesk.bold, color: Colors.accent },
  resendText: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.accent },
  errorText: { fontFamily: Fonts.outfit.regular, fontSize: 13, color: Colors.danger, marginTop: 12, textAlign: 'center' },
  helpText: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[400], textAlign: 'center', paddingBottom: 32 },
});
