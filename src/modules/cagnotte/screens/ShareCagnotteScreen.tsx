import { useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
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
import { buildCagnotteLink } from '@/shared/api/cagnotteApi';

function formatFcfa(n: number): string {
  return `${n.toLocaleString('fr-FR')} FCFA`;
}

export default function ShareCagnotteScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; nom?: string; motif?: string; objectif?: string }>();

  const cagnotteId = typeof params.id === 'string' ? params.id : '';
  const nom = typeof params.nom === 'string' && params.nom
    ? params.nom
    : typeof params.motif === 'string' && params.motif
      ? params.motif
      : 'Cagnotte association';
  const objectif = useMemo(() => {
    const n = parseInt(String(params.objectif ?? ''), 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [params.objectif]);

  const shareLink = cagnotteId ? buildCagnotteLink(cagnotteId) : '';

  const shareCollect = async () => {
    if (!shareLink) return;
    try {
      await Share.share({
        message: `Participez à « ${nom} » sur COTICI : ${shareLink}`,
        url: shareLink,
        title: `Cagnotte — ${nom}`,
      });
    } catch {
      /* annulé par l'utilisateur */
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <AnimatedPressable style={styles.backButton} onPress={() => router.back()}>
            <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
          </AnimatedPressable>
        </View>

        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Feather name="home" size={28} color={Colors.success} />
          </View>
          <Text style={styles.heroTitle}>Partager la cagnotte</Text>
          <Text style={styles.heroSub}>
            Toute personne avec un compte Cotici peut ouvrir ce lien et participer librement.
          </Text>
        </View>

        <View style={styles.motifPill}>
          <Feather name="tag" size={16} color={Colors.success} />
          <Text style={styles.motifText} numberOfLines={2}>{nom}</Text>
        </View>

        {objectif !== null ? (
          <Text style={styles.objectifLabel}>Objectif : {formatFcfa(objectif)}</Text>
        ) : null}

        <View style={styles.qrPanel}>
          <View style={styles.qrFrame}>
            {shareLink ? (
              <QRCode
                value={shareLink}
                size={220}
                color={Colors.gray[900]}
                backgroundColor={Colors.white}
              />
            ) : null}
          </View>
          <Text style={styles.qrHint}>
            Scannez ou partagez ce code pour accéder à la cagnotte.
          </Text>
        </View>

        <View style={styles.linkBox}>
          <Text style={styles.linkLabel}>Lien de contribution</Text>
          <Text style={styles.linkValue} selectable>
            {shareLink || '—'}
          </Text>
        </View>

        <AnimatedPressable style={styles.shareButton} onPress={shareCollect} disabled={!shareLink}>
          <Feather name="share-2" size={18} color={Colors.white} />
          <Text style={styles.shareButtonText}>Partager le lien</Text>
        </AnimatedPressable>

        <AnimatedPressable
          style={styles.viewButton}
          onPress={() =>
            router.push({
              pathname: '/cagnotte-collect/[id]',
              params: { id: cagnotteId },
            })
          }
          disabled={!cagnotteId}
        >
          <Feather name="eye" size={18} color={Colors.success} />
          <Text style={styles.viewButtonText}>Voir la cagnotte</Text>
        </AnimatedPressable>

        <Text style={styles.footerNote}>
          Les fonds collectés sont crédités sur votre solde Cotici une fois l&apos;objectif atteint.
        </Text>

        <View style={{ height: 32 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.screen.bg },
  scroll: { paddingHorizontal: Theme.spacing.page, paddingBottom: 32 },
  header: { paddingVertical: Theme.spacing.sm },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Theme.screen.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...Theme.shadow.soft,
  },
  hero: { alignItems: 'center', marginBottom: 20, marginTop: 8 },
  heroIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: withOpacity(Colors.success, 0.1),
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
  motifPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    alignSelf: 'center',
    maxWidth: '100%',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: Theme.radius.pill,
    backgroundColor: withOpacity(Colors.success, 0.08),
    borderWidth: 1,
    borderColor: withOpacity(Colors.success, 0.2),
    marginBottom: 8,
  },
  motifText: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.success, flex: 1 },
  objectifLabel: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    color: Colors.gray[600],
    textAlign: 'center',
    marginBottom: 20,
  },
  qrPanel: { alignItems: 'center', marginBottom: 20 },
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
  },
  linkBox: {
    width: '100%',
    padding: 14,
    borderRadius: Theme.radius.md,
    backgroundColor: Theme.screen.surface,
    borderWidth: 1,
    borderColor: Colors.gray[200],
    marginBottom: 16,
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
    color: Colors.success,
    lineHeight: 18,
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: Colors.success,
    paddingVertical: 16,
    borderRadius: Theme.radius.lg,
    marginBottom: 12,
  },
  shareButtonText: { fontFamily: Fonts.outfit.medium, fontSize: 16, color: Colors.white },
  viewButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 16,
    borderRadius: Theme.radius.lg,
    borderWidth: 2,
    borderColor: Colors.success,
    marginBottom: 12,
  },
  viewButtonText: { fontFamily: Fonts.outfit.medium, fontSize: 16, color: Colors.success },
  footerNote: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 12,
    color: Colors.gray[500],
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 8,
  },
});
