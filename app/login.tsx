import { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/constants/Colors';
import { Fonts } from '@/constants/Fonts';
import { Theme } from '@/constants/Theme';

export default function LoginScreen() {
  const router = useRouter();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [pin, setPin] = useState(['', '', '', '']);
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

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
        </TouchableOpacity>
        <View style={styles.headerLogo}>
          <Image source={require('../assets/logo_cotici.png')} style={styles.logoImage} resizeMode="contain" />
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

        <TouchableOpacity style={styles.loginButton} onPress={() => router.push('/otp')}>
          <Text style={styles.loginButtonText}>Connexion</Text>
        </TouchableOpacity>

        <TouchableOpacity>
          <Text style={styles.forgotPin}>Code PIN oublié ?</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push('/create-account')} style={styles.createAccountWrap}>
          <Text style={styles.createAccountText}>
            Pas encore de compte ? <Text style={styles.createAccountBold}>Créer un compte</Text>
          </Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={() => router.push('/(tabs)')}>
          <Text style={styles.demoLink}>Passer directement au dashboard →</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.biometric}>
        <Text style={styles.biometricLabel}>Ou connectez-vous avec</Text>
        <TouchableOpacity style={styles.biometricButton}>
          <Feather name="smartphone" size={32} color={Colors.brand} />
        </TouchableOpacity>
      </View>
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
  pinInput: { flex: 1, height: 64, backgroundColor: Colors.gray[50], borderRadius: 16, fontFamily: Fonts.outfit.regular, fontSize: 24, textAlign: 'center', color: Colors.gray[900] },
  loginButton: { backgroundColor: Colors.brand, paddingVertical: 16, borderRadius: 16, alignItems: 'center', marginBottom: 16 },
  loginButtonText: { fontFamily: Fonts.outfit.medium, fontSize: 16, color: Colors.white },
  forgotPin: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.accent, textAlign: 'center', marginBottom: 12 },
  createAccountWrap: { marginBottom: 16 },
  createAccountText: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[500], textAlign: 'center' },
  createAccountBold: { color: Colors.accent, fontFamily: Fonts.outfit.medium },
  demoLink: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[400], textAlign: 'center' },
  biometric: { alignItems: 'center', gap: 12, paddingBottom: 32 },
  biometricLabel: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500] },
  biometricButton: { width: 64, height: 64, borderRadius: 32, backgroundColor: withOpacity(Colors.brand, 0.1), alignItems: 'center', justifyContent: 'center' },
});
