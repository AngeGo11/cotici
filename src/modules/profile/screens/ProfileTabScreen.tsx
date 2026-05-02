import { View, Text, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';

const settingsOptions = [
  { id: 'notifications', label: 'Notifications', description: 'Gérer vos alertes', icon: 'bell' as const, color: Colors.brand },
  { id: 'security', label: 'Sécurité', description: 'Code PIN et biométrie', icon: 'lock' as const, color: Colors.success },
  { id: 'help', label: 'Aide & Support', description: 'FAQ et contact', icon: 'help-circle' as const, color: Colors.info },
  { id: 'terms', label: "Conditions d'utilisation", description: 'Politique de confidentialité', icon: 'file-text' as const, color: Colors.gray[600] },
];

export default function ProfileScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.topIntro}>
          <Text style={styles.pageTitle}>Mon profil</Text>
          <Text style={styles.pageSubtitle}>Votre identité et vos préférences COTICI</Text>
        </View>

        <View style={styles.userCard}>
          <Text style={styles.userTag}>Compte COTICI</Text>
          <View style={styles.userRow}>
            <View style={styles.userAvatar}>
              <Text style={styles.userAvatarText}>MK</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.userName}>Marie Koné</Text>
              <Text style={styles.userPhone}>+225 07 12 34 56 78</Text>
            </View>
            <TouchableOpacity style={styles.editHint} activeOpacity={0.7} onPress={() => router.push('/edit-profile')}>
              <Feather name="edit-3" size={18} color="rgba(255,255,255,0.9)" />
            </TouchableOpacity>
          </View>
          <View style={styles.balanceBox}>
            <View>
              <Text style={styles.balanceLabel}>Solde total</Text>
              <Text style={styles.balanceValue}>487.000 F</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.balanceLabel}>Membre depuis</Text>
              <Text style={styles.memberSince}>Janvier 2024</Text>
            </View>
          </View>
        </View>

        <Text style={styles.sectionEyebrow}>Activité</Text>
        <View style={styles.statsRow}>
          <View style={[styles.statCard, { borderTopColor: Colors.brand }]}>
            <View style={[styles.statIconBg, { backgroundColor: withOpacity(Colors.brand, 0.12) }]}>
              <Feather name="users" size={20} color={Colors.brand} />
            </View>
            <Text style={[styles.statValue, { color: Colors.brand }]}>3</Text>
            <Text style={styles.statLabel}>Tontines</Text>
          </View>
          <View style={[styles.statCard, { borderTopColor: Colors.success }]}>
            <View style={[styles.statIconBg, { backgroundColor: withOpacity(Colors.success, 0.12) }]}>
              <Feather name="target" size={20} color={Colors.success} />
            </View>
            <Text style={[styles.statValue, { color: Colors.success }]}>2</Text>
            <Text style={styles.statLabel}>Objectifs</Text>
          </View>
          <View style={[styles.statCard, { borderTopColor: Colors.info }]}>
            <View style={[styles.statIconBg, { backgroundColor: withOpacity(Colors.info, 0.12) }]}>
              <Feather name="award" size={20} color={Colors.info} />
            </View>
            <Text style={[styles.statValue, { color: Colors.info }]}>98%</Text>
            <Text style={styles.statLabel}>Fiabilité</Text>
          </View>
        </View>

        <Text style={styles.sectionEyebrow}>Paramètres</Text>
        <View style={styles.settingsBlock}>
          {settingsOptions.map((option) => (
            <TouchableOpacity
              key={option.id}
              style={styles.settingsItem}
              activeOpacity={0.85}
              onPress={() => {
                if (option.id === 'notifications') router.push('/notifications');
                else if (option.id === 'security') router.push('/security');
                else if (option.id === 'help') router.push('/help-support');
                else if (option.id === 'terms') router.push('/terms');
              }}
            >
              <View style={styles.settingsLeft}>
                <View style={[styles.settingsIcon, { backgroundColor: withOpacity(option.color, 0.1) }]}>
                  <Feather name={option.icon} size={20} color={option.color} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.settingsLabel}>{option.label}</Text>
                  <Text style={styles.settingsDesc}>{option.description}</Text>
                </View>
              </View>
              <Feather name="chevron-right" size={20} color={Colors.gray[400]} />
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={() => router.replace('/')} activeOpacity={0.85}>
          <Feather name="log-out" size={20} color={Colors.danger} />
          <Text style={styles.logoutText}>Se déconnecter</Text>
        </TouchableOpacity>

        <Text style={styles.version}>COTICI v1.0.2</Text>
        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.screen.bg },
  scroll: { paddingBottom: 100 },
  topIntro: { paddingHorizontal: Theme.spacing.page, paddingTop: Theme.spacing.sm, marginBottom: Theme.spacing.lg },
  pageTitle: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 28, color: Colors.gray[900], marginBottom: 6 },
  pageSubtitle: { fontFamily: Fonts.outfit.regular, fontSize: 15, color: Colors.gray[600], lineHeight: 22 },
  userCard: {
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Colors.brand,
    borderRadius: Theme.radius.xl,
    padding: Theme.spacing.xl,
    marginBottom: Theme.spacing.xl,
    ...Theme.shadow.brandHero,
  },
  userTag: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
    letterSpacing: 0.8,
    marginBottom: Theme.spacing.md,
    textTransform: 'uppercase',
  },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: Theme.spacing.md, marginBottom: Theme.spacing.lg },
  userAvatar: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  userAvatarText: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 24, color: Colors.white },
  userName: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 22, color: Colors.white, marginBottom: 4 },
  userPhone: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: 'rgba(255,255,255,0.85)' },
  editHint: { padding: 8 },
  balanceBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: Theme.radius.md,
    padding: Theme.spacing.lg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  balanceLabel: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: 'rgba(255,255,255,0.8)', marginBottom: 4 },
  balanceValue: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 26, color: Colors.white },
  memberSince: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.white },
  sectionEyebrow: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 13,
    color: Colors.gray[500],
    paddingHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.md,
    letterSpacing: 0.2,
  },
  statsRow: { flexDirection: 'row', gap: Theme.spacing.md, paddingHorizontal: Theme.spacing.page, marginBottom: Theme.spacing.xl },
  statCard: {
    flex: 1,
    backgroundColor: Theme.screen.surface,
    borderRadius: Theme.radius.md,
    padding: Theme.spacing.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.gray[100],
    borderTopWidth: 3,
    ...Theme.shadow.card,
  },
  statIconBg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statValue: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 22, marginBottom: 2 },
  statLabel: { fontFamily: Fonts.outfit.regular, fontSize: 11, color: Colors.gray[600], textAlign: 'center' },
  settingsBlock: { paddingHorizontal: Theme.spacing.page, marginBottom: Theme.spacing.lg },
  settingsItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Theme.screen.surface,
    borderRadius: Theme.radius.md,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    ...Theme.shadow.soft,
  },
  settingsLeft: { flexDirection: 'row', alignItems: 'center', gap: Theme.spacing.md, flex: 1 },
  settingsIcon: { width: 44, height: 44, borderRadius: Theme.radius.sm, alignItems: 'center', justifyContent: 'center' },
  settingsLabel: { fontFamily: Fonts.outfit.medium, fontSize: 15, color: Colors.gray[900], marginBottom: 2 },
  settingsDesc: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500] },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Theme.screen.surface,
    paddingVertical: 16,
    borderRadius: Theme.radius.md,
    marginBottom: Theme.spacing.lg,
    borderWidth: 1,
    borderColor: withOpacity(Colors.danger, 0.25),
    ...Theme.shadow.soft,
  },
  logoutText: { fontFamily: Fonts.outfit.medium, fontSize: 16, color: Colors.danger },
  version: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[400], textAlign: 'center' },
});
