import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { AnimatedPressable } from '@/shared/ui';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';
import { setOrdreRamassage } from '@/shared/api';
import { useTontineDetail } from '@/modules/tontine/hooks/useTontineDetail';

type OrdreMember = {
  id: string;
  name: string;
  avatar: string;
};

function reorder<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length || from === to) {
    return list;
  }
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

export default function DefineOrdreRamassageScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tontineId?: string; tontineNom?: string; memberCount?: string }>();
  const tontineId = typeof params.tontineId === 'string' ? params.tontineId : undefined;
  const { detail, loading } = useTontineDetail(tontineId);

  const tontineNom = useMemo(
    () =>
      typeof params.tontineNom === 'string' && params.tontineNom.trim()
        ? params.tontineNom.trim()
        : 'Tontine Entrepreneurs',
    [params.tontineNom],
  );

  const [members, setMembers] = useState<OrdreMember[]>([]);
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (!detail?.membres?.length) return;
    setMembers(
      [...detail.membres]
        .sort((a, b) => a.ordre_ramassage - b.ordre_ramassage)
        .map((m) => ({
          id: m.id,
          name: m.name,
          avatar: m.avatar,
        })),
    );
  }, [detail?.membres]);

  const moveUp = useCallback((index: number) => {
    setMembers((prev) => reorder(prev, index, index - 1));
  }, []);

  const moveDown = useCallback((index: number) => {
    setMembers((prev) => reorder(prev, index, index + 1));
  }, []);

  const reverseOrder = useCallback(() => {
    setMembers((prev) => [...prev].reverse());
  }, []);

  const publish = () => {
    Alert.alert(
      'Publier l\'ordre de ramassage ?',
      `L'ordre sera visible par tous les membres et verrouillé définitivement. Il ne pourra plus être modifié dans les paramètres de la tontine.\n\nLe premier tour de cotisations pourra ensuite démarrer.`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Publier',
          onPress: () => {
            if (!tontineId) return;
            void (async () => {
              setPublishing(true);
              const ordres = members.map((m, index) => ({
                membre_id: parseInt(m.id, 10),
                ordre_ramassage: index + 1,
              }));
              const result = await setOrdreRamassage(parseInt(tontineId, 10), ordres);
              setPublishing(false);
              if (!result.ok) {
                Alert.alert('Erreur', result.detail);
                return;
              }
              router.replace({
                pathname: '/tontine-details',
                params: { id: tontineId },
              });
            })();
          },
        },
      ],
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <AnimatedPressable style={styles.backButton} onPress={() => router.back()}>
            <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
          </AnimatedPressable>
        </View>

        <View style={styles.heroBlock}>
          <View style={styles.heroIconWrap}>
            <Feather name="list" size={28} color={Colors.brand} />
          </View>
          <Text style={styles.heroTitle}>Ordre de ramassage</Text>
          <Text style={styles.heroSubtitle}>{tontineNom}</Text>
          <Text style={styles.heroHint}>
            Tous les membres ont rejoint. Classez qui reçoit la cagnotte en 1er, 2e, 3e…
          </Text>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statChip}>
            <Feather name="users" size={16} color={Colors.brand} />
            <Text style={styles.statText}>{members.length} membres</Text>
          </View>
          <AnimatedPressable style={styles.reverseChip} onPress={reverseOrder}>
            <Feather name="rotate-ccw" size={16} color={Colors.gray[700]} />
            <Text style={styles.reverseText}>Inverser</Text>
          </AnimatedPressable>
        </View>

        <Text style={styles.sectionEyebrow}>Planning</Text>
        <Text style={styles.sectionHint}>
          Le membre en position 1 ramasse au premier tour, puis 2, etc.
        </Text>

        {members.map((member, index) => {
          const position = index + 1;
          const isFirst = index === 0;
          const isLast = index === members.length - 1;

          return (
            <View key={member.id} style={styles.memberRow}>
              <View style={styles.positionBadge}>
                <Text style={styles.positionText}>{position}</Text>
              </View>

              <View style={styles.memberAvatar}>
                <Text style={styles.memberAvatarText}>{member.avatar}</Text>
              </View>

              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{member.name}</Text>
                <Text style={styles.memberSub}>
                  {position === 1 ? 'Premier à ramasser' : `Tour ${position}`}
                </Text>
              </View>

              <View style={styles.moveActions}>
                <AnimatedPressable
                  style={[styles.moveButton, isFirst && styles.moveButtonDisabled]}
                  onPress={() => moveUp(index)}
                  disabled={isFirst}
                >
                  <Feather
                    name="chevron-up"
                    size={20}
                    color={isFirst ? Colors.gray[300] : Colors.gray[700]}
                  />
                </AnimatedPressable>
                <AnimatedPressable
                  style={[styles.moveButton, isLast && styles.moveButtonDisabled]}
                  onPress={() => moveDown(index)}
                  disabled={isLast}
                >
                  <Feather
                    name="chevron-down"
                    size={20}
                    color={isLast ? Colors.gray[300] : Colors.gray[700]}
                  />
                </AnimatedPressable>
              </View>
            </View>
          );
        })}

        <View style={styles.warningBanner}>
          <Feather name="alert-triangle" size={18} color={Colors.accent} />
          <Text style={styles.warningText}>
            Après publication, l&apos;ordre de ramassage est définitif. Il ne sera plus modifiable
            depuis les paramètres du groupe — seules les autres règles (montant, fréquence, etc.)
            pourront encore être ajustées.
          </Text>
        </View>

        <AnimatedPressable style={styles.publishButton} onPress={publish}>
          <Feather name="check-circle" size={20} color={Colors.white} />
          <Text style={styles.publishButtonText}>Publier l&apos;ordre</Text>
        </AnimatedPressable>

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Theme.screen.bg },
  scroll: { paddingBottom: 100 },
  header: { paddingHorizontal: Theme.spacing.page, paddingVertical: Theme.spacing.sm },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Theme.screen.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...Theme.shadow.soft,
  },
  heroBlock: {
    paddingHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.lg,
    alignItems: 'center',
  },
  heroIconWrap: {
    width: 72,
    height: 72,
    borderRadius: Theme.radius.lg,
    backgroundColor: withOpacity(Colors.brand, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Theme.spacing.lg,
  },
  heroTitle: {
    fontFamily: Fonts.spaceGrotesk.bold,
    fontSize: 28,
    color: Colors.gray[900],
    marginBottom: 8,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 16,
    color: Colors.brand,
    textAlign: 'center',
    marginBottom: 8,
  },
  heroHint: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 15,
    color: Colors.gray[600],
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: Theme.spacing.sm,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.lg,
    gap: 12,
  },
  statChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: withOpacity(Colors.brand, 0.1),
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: withOpacity(Colors.brand, 0.2),
  },
  statText: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.brand },
  reverseChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Theme.screen.surface,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: Theme.radius.md,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    ...Theme.shadow.soft,
  },
  reverseText: { fontFamily: Fonts.outfit.medium, fontSize: 14, color: Colors.gray[700] },
  sectionEyebrow: {
    fontFamily: Fonts.outfit.medium,
    fontSize: 13,
    color: Colors.gray[500],
    paddingHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.sm,
    letterSpacing: 0.2,
  },
  sectionHint: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    color: Colors.gray[600],
    paddingHorizontal: Theme.spacing.page,
    marginBottom: Theme.spacing.md,
    lineHeight: 20,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Theme.screen.surface,
    borderRadius: Theme.radius.lg,
    padding: Theme.spacing.md,
    marginBottom: Theme.spacing.sm,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    gap: 12,
    ...Theme.shadow.soft,
  },
  positionBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: withOpacity(Colors.brand, 0.12),
    alignItems: 'center',
    justifyContent: 'center',
  },
  positionText: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 16, color: Colors.brand },
  memberAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarText: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 13, color: Colors.white },
  memberInfo: { flex: 1 },
  memberName: { fontFamily: Fonts.outfit.medium, fontSize: 15, color: Colors.gray[900] },
  memberSub: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500], marginTop: 2 },
  moveActions: { gap: 4 },
  moveButton: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: Colors.gray[50],
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.gray[100],
  },
  moveButtonDisabled: { opacity: 0.5 },
  warningBanner: {
    flexDirection: 'row',
    gap: 12,
    marginHorizontal: Theme.spacing.page,
    marginTop: Theme.spacing.lg,
    marginBottom: Theme.spacing.xl,
    backgroundColor: withOpacity(Colors.accent, 0.08),
    borderRadius: Theme.radius.lg,
    padding: Theme.spacing.lg,
    borderWidth: 1,
    borderColor: withOpacity(Colors.accent, 0.22),
    alignItems: 'flex-start',
  },
  warningText: {
    flex: 1,
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    color: Colors.gray[700],
    lineHeight: 20,
  },
  publishButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Colors.brand,
    paddingVertical: Theme.spacing.lg,
    borderRadius: Theme.radius.md,
    ...Theme.shadow.soft,
  },
  publishButtonText: { fontFamily: Fonts.outfit.medium, fontSize: 17, color: Colors.white },
});
