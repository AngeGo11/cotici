import { useState, useRef, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/constants/Colors';
import { Fonts } from '@/constants/Fonts';
import { Theme } from '@/constants/Theme';

export default function OTPScreen() {
  const router = useRouter();
  const [otp, setOtp] = useState(['', '', '', '']);
  const [timer, setTimer] = useState(60);
  const inputRefs = useRef<(TextInput | null)[]>([]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimer((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (otp.every((digit) => digit !== '')) {
      setTimeout(() => { router.replace('/(tabs)'); }, 500);
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
    setTimer(60);
    setOtp(['', '', '', '']);
    inputRefs.current[0]?.focus();
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
        </TouchableOpacity>
        <View style={styles.headerLogo}>
          <Image source={require('../assets/logo_cotici.png')} style={styles.logoImage} resizeMode="contain" />
        </View>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <Feather name="message-square" size={40} color={Colors.brand} />
        </View>

        <Text style={styles.title}>Vérification</Text>
        <Text style={styles.subtitle}>Entrez le code reçu par SMS</Text>

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
            <TouchableOpacity onPress={handleResend}>
              <Text style={styles.resendText}>Renvoyer le code</Text>
            </TouchableOpacity>
          )}
        </View>
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
  otpInput: { width: 64, height: 80, backgroundColor: Colors.gray[50], borderRadius: 16, fontFamily: Fonts.spaceGrotesk.bold, fontSize: 28, textAlign: 'center', color: Colors.gray[900] },
  otpInputFilled: { backgroundColor: Theme.screen.surface, borderWidth: 2, borderColor: withOpacity(Colors.brand, 0.3) },
  timerContainer: { alignItems: 'center' },
  timerText: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[500] },
  timerValue: { fontFamily: Fonts.spaceGrotesk.bold, color: Colors.accent },
  resendText: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.accent },
  helpText: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[400], textAlign: 'center', paddingBottom: 32 },
});
