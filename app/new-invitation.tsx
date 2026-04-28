import { useState, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/constants/Colors';
import { Fonts } from '@/constants/Fonts';
import { Theme } from '@/constants/Theme';
import { buildOutgoingInvitation, pushInvitation } from '@/data/invitationStore';

const DEFAULT_TONTINE_ID = 't1';
const DEFAULT_TONTINE_NOM = 'Tontine Famille Solidaire';

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length >= 10 && digits.startsWith('225')) return `+${digits}`;
  if (digits.length === 10) return `+225${digits}`;
  if (value.trim().startsWith('+')) return value.replace(/\s/g, '');
  if (digits.length > 0) return digits.startsWith('225') ? `+${digits}` : `+225${digits}`;
  return value.trim();
}

export default function NewInvitationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tontineId?: string; tontineNom?: string }>();
  const tontineId = useMemo(
    () => (typeof params.tontineId === 'string' ? params.tontineId : DEFAULT_TONTINE_ID),
    [params.tontineId],
  );
  const tontineNom = useMemo(
    () => (typeof params.tontineNom === 'string' && params.tontineNom ? params.tontineNom : DEFAULT_TONTINE_NOM),
    [params.tontineNom],
  );

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  const canSubmit = name.trim().length >= 2 && phone.replace(/\D/g, '').length >= 8;

  const submit = () => {
    setError(null);
    if (!name.trim() || name.trim().length < 2) {
      setError('Indiquez le nom de la personne (au moins 2 caractères).');
      return;
    }
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 8) {
      setError('Vérifiez le numéro de téléphone (au moins 8 chiffres).');
      return;
    }
    const numTel = normalizePhone(phone);
    const inv = buildOutgoingInvitation({
      inviteeName: name.trim(),
      numTel,
      tontineId,
      tontineNom,
    });
    pushInvitation(inv);
    router.back();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.85}>
            <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Nouvelle invitation</Text>
          <View style={styles.backButton} />
        </View>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <View style={styles.heroIcon}>
              <Feather name="user-plus" size={28} color={Colors.brand} />
            </View>
            <Text style={styles.heroTitle}>Inviter un membre</Text>
            <Text style={styles.heroSub}>
              Saisissez le nom et le numéro de la personne : elle recevra un SMS avec le lien pour rejoindre
              la tontine.
            </Text>
          </View>

          <View style={styles.tontinePill}>
            <Feather name="users" size={16} color={Colors.brand} />
            <Text style={styles.tontinePillText} numberOfLines={1}>
              {tontineNom}
            </Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Nom de la personne</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Ex. : Awa Diallo"
              placeholderTextColor={Colors.gray[400]}
              style={styles.input}
              autoCapitalize="words"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Numéro de téléphone</Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="07 XX XX XX XX"
              placeholderTextColor={Colors.gray[400]}
              style={styles.input}
              keyboardType="phone-pad"
            />
            <Text style={styles.hint}>Indicatif Côte d&apos;Ivoire : +225 (ajouté automatiquement si besoin).</Text>
          </View>

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.submit, !canSubmit && styles.submitDisabled]}
            onPress={submit}
            activeOpacity={0.9}
            disabled={!canSubmit}
          >
            <Feather name="send" size={18} color={Colors.white} />
            <Text style={styles.submitText}>Envoyer l&apos;invitation</Text>
          </TouchableOpacity>

          <View style={{ height: 32 }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.screen.bg },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Theme.spacing.page,
    paddingVertical: 12,
  },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: Theme.screen.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 18, color: Colors.gray[900] },
  scroll: { paddingHorizontal: Theme.spacing.page, paddingBottom: 32, paddingTop: 8 },
  hero: { alignItems: 'center', marginBottom: 20 },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: withOpacity(Colors.brand, 0.1),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  heroTitle: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 22, color: Colors.gray[900], marginBottom: 8, textAlign: 'center' },
  heroSub: { fontFamily: Fonts.outfit.regular, fontSize: 15, color: Colors.gray[600], textAlign: 'center', lineHeight: 22 },
  tontinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
    maxWidth: '100%',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Theme.radius.pill,
    backgroundColor: withOpacity(Colors.brand, 0.08),
    borderWidth: 1,
    borderColor: withOpacity(Colors.brand, 0.2),
    marginBottom: 24,
  },
  tontinePillText: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.brand, flex: 1 },
  field: { marginBottom: 18 },
  label: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.gray[700], marginBottom: 8 },
  input: {
    backgroundColor: Theme.screen.surface,
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontFamily: Fonts.outfit.regular,
    fontSize: 16,
    color: Colors.gray[900],
  },
  hint: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500], marginTop: 8 },
  errorText: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.danger, marginBottom: 8 },
  submit: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.brand,
    paddingVertical: 16,
    borderRadius: Theme.radius.lg,
    marginTop: 8,
  },
  submitDisabled: { opacity: 0.5 },
  submitText: { fontFamily: Fonts.outfit.medium, fontSize: 16, color: Colors.white },
});
