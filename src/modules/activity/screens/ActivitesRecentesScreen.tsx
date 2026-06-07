import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { AnimatedPressable } from '@/shared/ui';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';
import { useWalletActivities } from '@/modules/activity/hooks';
import {
  activityToneStyle,
  formatActivityAmount,
  resolveActivityToneFromDetail,
} from '@/shared/api/activityDisplay';

export default function ActivitesRecentesScreen() {
  const router = useRouter();
  const { activities, loading, error } = useWalletActivities();

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <AnimatedPressable style={styles.backButton} onPress={() => router.back()}>
          <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
        </AnimatedPressable>
        <Text style={styles.headerTitle}>Activités récentes</Text>
        <View style={{ width: 40 }} />
      </View>
      <Text style={styles.subtitle}>Historique de vos mouvements sur COTICI</Text>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {loading ? (
          <View style={styles.centered}>
            <ActivityIndicator color={Colors.success} />
          </View>
        ) : error ? (
          <Text style={styles.emptyText}>{error}</Text>
        ) : activities.length === 0 ? (
          <Text style={styles.emptyText}>Aucune activité pour le moment.</Text>
        ) : null}
        {!loading &&
          activities.map((activity) => {
            const tone = resolveActivityToneFromDetail(activity);
            const toneStyle = activityToneStyle(tone);
            return (
          <AnimatedPressable
            key={activity.id}
            style={styles.activityItem}
            onPress={() => router.push(`/activite/${activity.id}`)} >
            <View style={styles.activityLeft}>
              <View
                style={[
                  styles.activityIcon,
                  { backgroundColor: toneStyle.iconBg },
                ]}
              >
                <Feather
                  name={toneStyle.icon}
                  size={20}
                  color={toneStyle.iconColor}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.activityType}>{activity.type}</Text>
                <Text style={styles.activityDate}>{activity.date}</Text>
              </View>
            </View>
            <View style={styles.activityRight}>
              <Text
                style={[
                  styles.activityAmount,
                  { color: toneStyle.amountColor },
                ]}
              >
                {formatActivityAmount(activity.amount, tone)} F
              </Text>
              <Feather name="chevron-right" size={18} color={Colors.gray[400]} />
            </View>
          </AnimatedPressable>
            );
          })}
        <View style={{ height: 32 }} />
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
    paddingVertical: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.gray[100],
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 20, color: Colors.gray[900] },
  subtitle: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    color: Colors.gray[600],
    paddingHorizontal: Theme.spacing.page,
    marginBottom: 16,
  },
  scroll: { paddingBottom: 8 },
  activityItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: Theme.spacing.page,
    backgroundColor: Colors.gray[50],
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
  },
  activityLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  activityIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  activityType: { fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.gray[900] },
  activityDate: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500], marginTop: 2 },
  activityRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  activityAmount: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 14 },
  centered: { paddingVertical: 48, alignItems: 'center' },
  emptyText: {
    fontFamily: Fonts.outfit.regular,
    fontSize: 14,
    color: Colors.gray[500],
    textAlign: 'center',
    paddingHorizontal: Theme.spacing.page,
    paddingVertical: 24,
  },
});
