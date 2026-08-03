import type { ComponentProps, ReactNode } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { AnimatedPressable, Card, EmptyState, StatusBadge } from '@/shared/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';
import { useAuth } from '@/shared/auth';
import { useTontineDetail } from '@/modules/tontine/hooks/useTontineDetail';

type SettingsRowProps = {
  icon: ComponentProps<typeof Feather>['name'];
  iconColor?: string;
  title: string;
  subtitle: string;
  trailing?: ReactNode;
  onPress: () => void;
};

function SettingsRow({ icon, iconColor = Colors.brand, title, subtitle, trailing, onPress }: SettingsRowProps) {
  return (
    <AnimatedPressable style={styles.row} onPress={onPress} accessibilityRole="button">
      <View style={[styles.rowIcon, { backgroundColor: withOpacity(iconColor, 0.12) }]}>
        <Feather name={icon} size={20} color={iconColor} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowSubtitle}>{subtitle}</Text>
      </View>
      {trailing}
      <Feather name="chevron-right" size={20} color={Colors.gray[400]} />
    </AnimatedPressable>
  );
}

export default function ParametresGroupeScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const params = useLocalSearchParams<{ id?: string }>();
  const tontineId = typeof params.id === 'string' ? params.id : undefined;
  const { detail, loading, error } = useTontineDetail(tontineId);

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.brand} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !detail) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <AnimatedPressable style={styles.backButton} onPress={() => router.back()}>
            <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
          </AnimatedPressable>
        </View>
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error ?? 'Tontine introuvable.'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isHost = user?.id != null && detail.hote_id === user.id;

  if (!detail.is_admin) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.header}>
          <AnimatedPressable style={styles.backButton} onPress={() => router.back()}>
            <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
          </AnimatedPressable>
        </View>
        <EmptyState
          icon="lock"
          title="Accès réservé"
          description="Seuls les administrateurs du groupe peuvent accéder à ces paramètres."
          actionLabel="Retour"
          onAction={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  const regle = detail.regles;
  const cycleDemarre = detail.phase === 'active' || detail.phase === 'completed';
  const canManageLifecycle = isHost && (detail.phase === 'completed' || (!detail.tour_courant && detail.phase !== 'active'));

  const openMembres = () =>
    router.push({ pathname: '/membres-groupe', params: { id: String(detail.id), tontineNom: detail.nom } });
  const openExclure = () =>
    router.push({ pathname: '/exclure-membre', params: { id: String(detail.id), tontineNom: detail.nom } });
  const openRegles = () =>
    router.push({
      pathname: '/modifier-regles',
      params: { id: String(detail.id), tontineNom: detail.nom, ordrePublie: detail.ordre_publie ? '1' : '0' },
    });
  const openPenalites = () =>
    router.push({ pathname: '/penalites', params: { id: String(detail.id), tontineNom: detail.nom } });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.header}>
          <AnimatedPressable style={styles.backButton} onPress={() => router.back()}>
            <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
          </AnimatedPressable>
        </View>

        <View style={styles.titleBlock}>
          <View style={styles.titleIcon}>
            <Feather name="sliders" size={26} color={Colors.brand} />
          </View>
          <Text style={styles.title}>Paramètres du groupe</Text>
          <Text style={styles.subtitle}>{detail.nom}</Text>
        </View>

        <Text style={styles.sectionEyebrow}>Membres</Text>
        <Card variant="soft" padding={0} style={styles.section}>
          <SettingsRow
            icon="users"
            title="Gérer les membres"
            subtitle={`${detail.membres_actifs}/${detail.nombre_max} membres actifs${isHost ? ' · rôles' : ''}`}
            onPress={openMembres}
          />
          <View style={styles.divider} />
          <SettingsRow
            icon="user-minus"
            iconColor={Colors.danger}
            title="Exclure un membre"
            subtitle="Retirer définitivement du groupe"
            onPress={openExclure}
          />
        </Card>

        <Text style={styles.sectionEyebrow}>Règles</Text>
        <Card variant="soft" padding={0} style={styles.section}>
          <SettingsRow
            icon="settings"
            iconColor={Colors.info}
            title="Modifier les règles"
            subtitle={
              regle
                ? `${Number(regle.montant_cotisation).toLocaleString('fr-FR')} FCFA · ${regle.frequence.toLowerCase()} · pénalité ${Number(regle.montant_penalite).toLocaleString('fr-FR')} FCFA`
                : 'Montant, fréquence, pénalités'
            }
            trailing={cycleDemarre ? <StatusBadge label="Partiellement verrouillé" tone="warning" /> : undefined}
            onPress={openRegles}
          />
        </Card>

        <Text style={styles.sectionEyebrow}>Pénalités</Text>
        <Card variant="soft" padding={0} style={styles.section}>
          <SettingsRow
            icon="alert-triangle"
            iconColor={Colors.accent}
            title="Gérer les pénalités"
            subtitle="Attribuer, régler ou annuler"
            onPress={openPenalites}
          />
        </Card>

        {canManageLifecycle ? (
          <>
            <Text style={styles.sectionEyebrow}>Cycle de vie</Text>
            <Text style={styles.lifecycleHint}>
              Les actions d&apos;archivage et de suppression restent accessibles depuis la page principale de la
              tontine.
            </Text>
          </>
        ) : null}

        <View style={{ height: 24 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.screen.bg },
  scroll: { paddingBottom: 24 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Theme.spacing.page },
  errorText: { fontFamily: Fonts.outfit.regular, fontSize: 15, color: Colors.gray[600], textAlign: 'center' },
  header: { paddingHorizontal: Theme.spacing.page, paddingVertical: 12 },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBlock: { paddingHorizontal: Theme.spacing.page, alignItems: 'center', marginBottom: Theme.spacing.xl },
  titleIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: withOpacity(Colors.brand, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Theme.spacing.md,
  },
  title: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 22, color: Colors.gray[900], textAlign: 'center' },
  subtitle: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[500], marginTop: 4, textAlign: 'center' },
  sectionEyebrow: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 13,
    color: Colors.gray[500],
    paddingHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.sm,
  },
  section: { marginHorizontal: Theme.spacing.page, marginBottom: Theme.spacing.lg, overflow: 'hidden' },
  divider: { height: 1, backgroundColor: Colors.gray[100], marginLeft: Theme.spacing.lg + 40 + Theme.spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: Theme.spacing.lg,
  },
  rowIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontFamily: Fonts.outfit.medium, fontSize: 15, color: Colors.gray[900] },
  rowSubtitle: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500], marginTop: 2 },
  lifecycleHint: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 13,
    color: Colors.gray[500],
    paddingHorizontal: Theme.spacing.page,
    lineHeight: 18,
  },
});
