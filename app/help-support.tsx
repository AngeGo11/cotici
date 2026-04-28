import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Linking, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/constants/Colors';
import { Fonts } from '@/constants/Fonts';
import { Theme } from '@/constants/Theme';

const FAQ = [
  { id: '1', q: 'Comment inviter un membre dans ma tontine ?', a: "Depuis le détail d'une tontine, appuyez sur « Inviter » et partagez le lien par SMS ou WhatsApp." },
  { id: '2', q: 'Quel délai pour une cotisation ?', a: 'Les échéances figurent dans « Prochaines échéances ». Un rappel vous est envoyé avant la date limite.' },
  { id: '3', q: 'Comment retirer mon argent ?', a: "Depuis l'accueil, choisissez « Retrait » et indiquez le moyen de réception (Mobile Money ou compte bancaire)." },
  { id: '4', q: 'Que couvre l’aide d’urgence (tontine solidaire) ?', a: 'Uniquement les cas validés par le groupe selon le règlement (santé, deuil, etc.).' },
] as const;

const SUPPORT_EMAIL = 'support@cotici.app';
const WHATSAPP = 'https://wa.me/22500000000';

export default function HelpSupportScreen() {
  const router = useRouter();
  const [openId, setOpenId] = useState<string | null>(FAQ[0].id);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.85}>
          <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Aide & support</Text>
        <View style={styles.backButton} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.heroCard}>
          <Feather name="message-circle" size={28} color={Colors.brand} />
          <Text style={styles.heroTitle}>Une question ?</Text>
          <Text style={styles.heroSub}>Nous répondons en général sous 24 h ouvrées.</Text>
          <View style={styles.actions}>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
              activeOpacity={0.9}
            >
              <Feather name="mail" size={18} color={Colors.white} />
              <Text style={styles.primaryBtnText}>Écrire au support</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={() => Linking.openURL(WHATSAPP)} activeOpacity={0.9}>
              <Text style={styles.secondaryBtnText}>WhatsApp</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.sectionEyebrow}>Questions fréquentes</Text>
        {FAQ.map((item) => {
          const open = openId === item.id;
          return (
            <View key={item.id} style={styles.faqCard}>
              <Pressable onPress={() => setOpenId(open ? null : item.id)} style={styles.faqHeader}>
                <Text style={styles.faqQ}>{item.q}</Text>
                <Feather name={open ? 'chevron-up' : 'chevron-down'} size={20} color={Colors.gray[500]} />
              </Pressable>
              {open ? <Text style={styles.faqA}>{item.a}</Text> : null}
            </View>
          );
        })}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.screen.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Theme.spacing.page,
    paddingVertical: Theme.spacing.sm,
  },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: Theme.screen.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 18, color: Colors.gray[900] },
  scroll: { paddingHorizontal: Theme.spacing.page, paddingBottom: 32 },
  heroCard: {
    backgroundColor: withOpacity(Colors.brand, 0.08),
    borderRadius: Theme.radius.xl,
    padding: Theme.spacing.xl,
    marginBottom: Theme.spacing.xl,
    borderWidth: 1,
    borderColor: withOpacity(Colors.brand, 0.15),
    alignItems: 'center',
  },
  heroTitle: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 20, color: Colors.gray[900], marginTop: 12 },
  heroSub: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[600], textAlign: 'center', marginTop: 6, marginBottom: 16 },
  actions: { width: '100%', gap: 10 },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Colors.brand,
    paddingVertical: 14,
    borderRadius: Theme.radius.md,
  },
  primaryBtnText: { fontFamily: Fonts.outfit.medium, fontSize: 16, color: Colors.white },
  secondaryBtn: { alignItems: 'center', paddingVertical: 12, borderRadius: Theme.radius.md, borderWidth: 1, borderColor: Colors.brand },
  secondaryBtnText: { fontFamily: Fonts.outfit.medium, fontSize: 15, color: Colors.brand },
  sectionEyebrow: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 13,
    color: Colors.gray[500],
    marginBottom: Theme.spacing.md,
  },
  faqCard: {
    backgroundColor: Theme.screen.surface,
    borderRadius: Theme.radius.md,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[100],
  },
  faqHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  faqQ: { flex: 1, fontFamily: Fonts.outfit.medium, fontSize: 15, color: Colors.gray[900], lineHeight: 22 },
  faqA: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[600], lineHeight: 21, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: Colors.gray[100] },
});
