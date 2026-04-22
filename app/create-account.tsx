import { useState, useRef, type MutableRefObject } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/constants/Colors';
import { Fonts } from '@/constants/Fonts';
import { Theme } from '@/constants/Theme';

const PIN_LENGTH = 4;

export default function CreateAccountScreen() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [pin, setPin] = useState<string[]>(() => Array(PIN_LENGTH).fill(''));
  const [confirmPin, setConfirmPin] = useState<string[]>(() => Array(PIN_LENGTH).fill(''));
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const pinRefs = useRef<(TextInput | null)[]>([]);
  const confirmPinRefs = useRef<(TextInput | null)[]>([]);

  const handlePinChange = (
    index: number,
    value: string,
    current: string[],
    setCurrent: (v: string[]) => void,
    refs: MutableRefObject<(TextInput | null)[]>,
  ) => {
    if (value.length > 1) return;
    if (value && !/^\d$/.test(value)) return;
    const next = [...current];
    next[index] = value;
    setCurrent(next);
    if (value && index < PIN_LENGTH - 1) refs.current[index + 1]?.focus();
  };

  const handlePinKeyPress = (
    index: number,
    key: string,
    digit: string,
    refs: MutableRefObject<(TextInput | null)[]>,
  ) => {
    if (key === 'Backspace' && !digit && index > 0) refs.current[index - 1]?.focus();
  };

  const pinComplete = pin.every((d) => d !== '');
  const confirmComplete = confirmPin.every((d) => d !== '');
  const pinsMatch = pinComplete && confirmComplete && pin.join('') === confirmPin.join('');
  const canSubmit =
    fullName.trim().length > 0 &&
    phoneNumber.trim().length > 0 &&
    pinsMatch &&
    acceptedTerms;

  const onSubmit = () => {
    if (!canSubmit) return;
    router.push('/otp');
  };

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
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

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Créer un compte</Text>
          <Text style={styles.subtitle}>Rejoignez COTICI en quelques étapes</Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Nom complet</Text>
            <TextInput
              style={styles.textField}
              value={fullName}
              onChangeText={setFullName}
              placeholder="Jean Kouassi"
              placeholderTextColor={Colors.gray[400]}
              autoCapitalize="words"
              autoCorrect={false}
            />
          </View>

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
                  ref={(el) => {
                    pinRefs.current[index] = el;
                  }}
                  style={[
                    styles.pinInput,
                    confirmComplete && !pinsMatch ? styles.pinInputError : null,
                  ]}
                  value={digit}
                  onChangeText={(v) =>
                    handlePinChange(index, v, pin, setPin, pinRefs)
                  }
                  onKeyPress={({ nativeEvent }) =>
                    handlePinKeyPress(index, nativeEvent.key, digit, pinRefs)
                  }
                  keyboardType="number-pad"
                  maxLength={1}
                  secureTextEntry
                />
              ))}
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Confirmer le code PIN</Text>
            <View style={styles.pinRow}>
              {confirmPin.map((digit, index) => (
                <TextInput
                  key={index}
                  ref={(el) => {
                    confirmPinRefs.current[index] = el;
                  }}
                  style={[
                    styles.pinInput,
                    confirmComplete && !pinsMatch ? styles.pinInputError : null,
                  ]}
                  value={digit}
                  onChangeText={(v) =>
                    handlePinChange(index, v, confirmPin, setConfirmPin, confirmPinRefs)
                  }
                  onKeyPress={({ nativeEvent }) =>
                    handlePinKeyPress(index, nativeEvent.key, digit, confirmPinRefs)
                  }
                  keyboardType="number-pad"
                  maxLength={1}
                  secureTextEntry
                />
              ))}
            </View>
            {confirmComplete && !pinsMatch ? (
              <Text style={styles.errorHint}>Les codes PIN ne correspondent pas</Text>
            ) : null}
          </View>

          <TouchableOpacity
            style={styles.termsRow}
            onPress={() => setAcceptedTerms(!acceptedTerms)}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, acceptedTerms && styles.checkboxChecked]}>
              {acceptedTerms ? (
                <Feather name="check" size={14} color={Colors.white} />
              ) : null}
            </View>
            <Text style={styles.termsText}>
              J'accepte les conditions d'utilisation et la politique de confidentialité
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.submitButton, !canSubmit && styles.submitButtonDisabled]}
            onPress={onSubmit}
            disabled={!canSubmit}
          >
            <Text style={styles.submitButtonText}>Continuer</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.loginLinkWrap}
            onPress={() => router.push('/login')}
          >
            <Text style={styles.loginLink}>
              Déjà un compte ? <Text style={styles.loginLinkBold}>Se connecter</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.screen.bg, paddingHorizontal: Theme.spacing.page },
  logoStyle: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 18},
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerLogo: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  logoImage: { width: 38, height: 38 },
  headerTitle: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 18, color: Colors.brand },
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 8, paddingBottom: 32 },
  title: {
    fontFamily: Fonts.spaceGrotesk.bold,
    fontSize: 28,
    color: Colors.gray[900],
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 16,
    color: Colors.gray[500],
    marginBottom: 28,
  },
  fieldGroup: { marginBottom: 20 },
  label: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    color: Colors.gray[700],
    marginBottom: 8,
  },
  textField: {
    height: 56,
    backgroundColor: Colors.gray[50],
    borderRadius: 16,
    paddingHorizontal: 16,
    fontFamily: Fonts.outfit.regular,
    fontSize: 16,
    color: Colors.gray[900],
  },
  phoneInput: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.gray[50],
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 56,
    gap: 8,
  },
  flag: { fontSize: 24 },
  prefix: { fontFamily: Fonts.outfit.regular, fontSize: 16, color: Colors.gray[600] },
  divider: { width: 1, height: 24, backgroundColor: Colors.gray[300], marginLeft: 4 },
  phoneField: {
    flex: 1,
    fontFamily: Fonts.outfit.regular,
    fontSize: 16,
    color: Colors.gray[900],
    paddingLeft: 8,
  },
  pinRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  pinInput: {
    flex: 1,
    height: 64,
    backgroundColor: Colors.gray[50],
    borderRadius: 16,
    fontFamily: Fonts.outfit.regular,
    fontSize: 24,
    textAlign: 'center',
    color: Colors.gray[900],
  },
  pinInputError: {
    borderWidth: 1,
    borderColor: withOpacity(Colors.danger, 0.5),
    backgroundColor: withOpacity(Colors.danger, 0.06),
  },
  errorHint: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 13,
    color: Colors.danger,
    marginTop: 8,
  },
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 24 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.gray[300],
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxChecked: {
    backgroundColor: Colors.brand,
    borderColor: Colors.brand,
  },
  termsText: {
    flex: 1,
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    color: Colors.gray[600],
    lineHeight: 20,
  },
  submitButton: {
    backgroundColor: Colors.brand,
    paddingVertical: 16,
    borderRadius: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  submitButtonDisabled: { opacity: 0.45 },
  submitButtonText: { fontFamily: Fonts.outfit.medium, fontSize: 16, color: Colors.white },
  loginLinkWrap: { alignItems: 'center' },
  loginLink: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    color: Colors.gray[500],
    textAlign: 'center',
  },
  loginLinkBold: { color: Colors.brand, fontFamily: Fonts.outfit.medium },
});
