import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Share,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { AnimatedPressable } from '@/shared/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';
import { fetchTontineDetail, sendTontineInvitation } from '@/shared/api';
import { buildTontineInviteLink } from '@/data/invitationStore';

const DEFAULT_TONTINE_ID = 't1';
const DEFAULT_TONTINE_NOM = 'Tontine Famille Solidaire';

type InviteMode = 'sms' | 'qr';

function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length >= 10 && digits.startsWith('225')) return `+${digits}`;
  if (digits.length === 10) return `+225${digits}`;
  if (value.trim().startsWith('+')) return value.replace(/\s/g, '');
  if (digits.length > 0) return digits.startsWith('225') ? `+${digits}` : `+225${digits}`;
  return value.trim();
}

function ModeSwitch({
  mode,
  onChange,
}: {
  mode: InviteMode;
  onChange: (mode: InviteMode) => void;
}) {
  return (
    <View style={styles.modeSwitch}>
      <AnimatedPressable
        style={[styles.modeButton, mode === 'sms' && styles.modeButtonActive]}
        onPress={() => onChange('sms')}
      >
        <Feather
          name="smartphone"
          size={18}
          color={mode === 'sms' ? Colors.white : Colors.gray[600]}
        />
        <Text style={[styles.modeButtonText, mode === 'sms' && styles.modeButtonTextActive]}>
          Par SMS
        </Text>
      </AnimatedPressable>
      <AnimatedPressable
        style={[styles.modeButton, mode === 'qr' && styles.modeButtonActive]}
        onPress={() => onChange('qr')}
      >
        <Feather
          name="maximize"
          size={18}
          color={mode === 'qr' ? Colors.white : Colors.gray[600]}
        />
        <Text style={[styles.modeButtonText, mode === 'qr' && styles.modeButtonTextActive]}>
          QR code
        </Text>
      </AnimatedPressable>
    </View>
  );
}

export default function NewInvitationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tontineId?: string; tontineNom?: string }>();
  const tontineId = useMemo(
    () => (typeof params.tontineId === 'string' ? params.tontineId : DEFAULT_TONTINE_ID),
    [params.tontineId],
  );
  const tontineNom = useMemo(
    () =>
      typeof params.tontineNom === 'string' && params.tontineNom
        ? params.tontineNom
        : DEFAULT_TONTINE_NOM,
    [params.tontineNom],
  );

  const [mode, setMode] = useState<InviteMode>('sms');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [qrPayload, setQrPayload] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const result = await fetchTontineDetail(tontineId);
      if (result.ok) {
        setQrPayload(result.data.qr_code);
      }
    })();
  }, [tontineId]);

  const inviteLink = useMemo(
    () => (qrPayload ? qrPayload : buildTontineInviteLink(tontineId)),
    [qrPayload, tontineId],
  );
  const canSubmit = name.trim().length >= 2 && phone.replace(/\D/g, '').length >= 8;

  const shareInviteLink = async () => {
    try {
      await Share.share({
        message: `Rejoignez « ${tontineNom} » sur COTICI : ${inviteLink}`,
        url: inviteLink,
        title: `Invitation — ${tontineNom}`,
      });
    } catch {
      /* annulé par l'utilisateur */
    }
  };

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
    void (async () => {
      setSubmitting(true);
      const result = await sendTontineInvitation(parseInt(tontineId, 10), numTel);
      setSubmitting(false);
      if (!result.ok) {
        setError(result.detail);
        return;
      }
      router.back();
    })();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={8}
      >
        <View style={styles.header}>
          <AnimatedPressable style={styles.backButton} onPress={() => router.back()}>
            <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
          </AnimatedPressable>
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
              <Feather
                name={mode === 'qr' ? 'maximize' : 'user-plus'}
                size={28}
                color={Colors.brand}
              />
            </View>
            <Text style={styles.heroTitle}>
              {mode === 'qr' ? 'Inviter par QR code' : 'Inviter un membre'}
            </Text>
            <Text style={styles.heroSub}>
              {mode === 'qr'
                ? 'Affichez ce code : la personne le scanne pour rejoindre la tontine sans saisir de numéro.'
                : 'Saisissez le nom et le numéro : la personne recevra un SMS avec le lien pour rejoindre la tontine.'}
            </Text>
          </View>

          <View style={styles.tontinePill}>
            <Feather name="users" size={16} color={Colors.brand} />
            <Text style={styles.tontinePillText} numberOfLines={1}>
              {tontineNom}
            </Text>
          </View>

          <ModeSwitch mode={mode} onChange={setMode} />

          {mode === 'sms' ? (
            <>
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
                <Text style={styles.hint}>
                  Indicatif Côte d&apos;Ivoire : +225 (ajouté automatiquement si besoin).
                </Text>
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <AnimatedPressable
                style={[styles.submit, !canSubmit && styles.submitDisabled]}
                onPress={submit}
                disabled={!canSubmit}
              >
                <Feather name="send" size={18} color={Colors.white} />
                <Text style={styles.submitText}>Envoyer l&apos;invitation</Text>
              </AnimatedPressable>
            </>
          ) : (
            <View style={styles.qrPanel}>
              <View style={styles.qrFrame}>
                <QRCode
                  value={inviteLink}
                  size={220}
                  color={Colors.gray[900]}
                  backgroundColor={Colors.white}
                />
              </View>
              <Text style={styles.qrHint}>
                Scannez avec l&apos;appareil photo ou l&apos;application COTICI.
              </Text>
              <View style={styles.linkBox}>
                <Text style={styles.linkLabel}>Lien d&apos;invitation</Text>
                <Text style={styles.linkValue} selectable>
                  {inviteLink}
                </Text>
              </View>
              <AnimatedPressable style={styles.shareButton} onPress={shareInviteLink}>
                <Feather name="share-2" size={18} color={Colors.white} />
                <Text style={styles.shareButtonText}>Partager le lien</Text>
              </AnimatedPressable>
            </View>
          )}

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
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Theme.screen.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  heroTitle: {
    fontFamily: Fonts.spaceGrotesk.bold,
    fontSize: 22,
    color: Colors.gray[900],
    marginBottom: 8,
    textAlign: 'center',
  },
  heroSub: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 15,
    color: Colors.gray[600],
    textAlign: 'center',
    lineHeight: 22,
  },
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
    marginBottom: 20,
  },
  tontinePillText: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.brand, flex: 1 },
  modeSwitch: {
    flexDirection: 'row',
    gap: 8,
    padding: 4,
    borderRadius: Theme.radius.lg,
    backgroundColor: Theme.screen.surface,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    marginBottom: 24,
  },
  modeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: Theme.radius.md,
  },
  modeButtonActive: {
    backgroundColor: Colors.brand,
    ...Theme.shadow.soft,
  },
  modeButtonText: {
    fontFamily: Fonts.outfit.semiBold,
    fontSize: 14,
    color: Colors.gray[600],
  },
  modeButtonTextActive: { color: Colors.white },
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
  qrPanel: { alignItems: 'center' },
  qrFrame: {
    padding: 20,
    borderRadius: Theme.radius.lg,
    backgroundColor: Colors.white,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    ...Theme.shadow.soft,
  },
  qrHint: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    color: Colors.gray[600],
    textAlign: 'center',
    marginTop: 16,
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  linkBox: {
    width: '100%',
    marginTop: 20,
    padding: 14,
    borderRadius: Theme.radius.md,
    backgroundColor: Theme.screen.surface,
    borderWidth: 1,
    borderColor: Colors.gray[200],
  },
  linkLabel: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 12,
    color: Colors.gray[500],
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  linkValue: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 13,
    color: Colors.brand,
    lineHeight: 18,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
    backgroundColor: Colors.brand,
    paddingVertical: 16,
    borderRadius: Theme.radius.lg,
    marginTop: 16,
  },
  shareButtonText: { fontFamily: Fonts.outfit.medium, fontSize: 16, color: Colors.white },
});
