import { useState } from 'react';
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors, withOpacity } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';

export default function SecurityScreen() {
  const router = useRouter();
  const [pinEnabled, setPinEnabled] = useState(true);
  const [biometry, setBiometry] = useState(true);
  const [hideBalance, setHideBalance] = useState(false);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} activeOpacity={0.85}>
          <Feather name="chevron-left" size={20} color={Colors.gray[700]} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Sécurité</Text>
        <View style={styles.backButton} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={styles.intro}>
          Protégez l’accès à COTICI et choisissez comment vos soldes s’affichent.
        </Text>

        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconWrap, { backgroundColor: withOpacity(Colors.brand, 0.1) }]}>
                <Feather name="lock" size={20} color={Colors.brand} />
              </View>
              <View>
                <Text style={styles.rowTitle}>Code PIN</Text>
                <Text style={styles.rowSub}>Requis à l’ouverture de l’app</Text>
              </View>
            </View>
            <Switch
              value={pinEnabled}
              onValueChange={setPinEnabled}
              trackColor={{ false: Colors.gray[200], true: withOpacity(Colors.brand, 0.4) }}
              thumbColor={pinEnabled ? Colors.brand : Colors.gray[400]}
            />
          </View>
          <TouchableOpacity style={styles.linkRow} activeOpacity={0.7}>
            <Text style={styles.linkText}>Modifier le code PIN</Text>
            <Feather name="chevron-right" size={18} color={Colors.gray[400]} />
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconWrap, { backgroundColor: withOpacity(Colors.success, 0.1) }]}>
                <Feather name="smile" size={20} color={Colors.success} />
              </View>
              <View>
                <Text style={styles.rowTitle}>Face ID / empreinte</Text>
                <Text style={styles.rowSub}>Déverrouillage rapide</Text>
              </View>
            </View>
            <Switch
              value={biometry}
              onValueChange={setBiometry}
              trackColor={{ false: Colors.gray[200], true: withOpacity(Colors.brand, 0.4) }}
              thumbColor={biometry ? Colors.brand : Colors.gray[400]}
            />
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.row}>
            <View style={styles.rowLeft}>
              <View style={[styles.iconWrap, { backgroundColor: withOpacity(Colors.info, 0.1) }]}>
                <Feather name="eye-off" size={20} color={Colors.info} />
              </View>
              <View>
                <Text style={styles.rowTitle}>Masquer les soldes</Text>
                <Text style={styles.rowSub}>Dans la liste et l’accueil</Text>
              </View>
            </View>
            <Switch
              value={hideBalance}
              onValueChange={setHideBalance}
              trackColor={{ false: Colors.gray[200], true: withOpacity(Colors.brand, 0.4) }}
              thumbColor={hideBalance ? Colors.brand : Colors.gray[400]}
            />
          </View>
        </View>

        <View style={styles.tip}>
          <Feather name="info" size={18} color={Colors.info} />
          <Text style={styles.tipText}>
            En cas de perte de téléphone, contactez le support pour verrouiller votre compte.
          </Text>
        </View>
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
  intro: { fontFamily: Fonts.outfit.regular, fontSize: 15, color: Colors.gray[600], lineHeight: 22, marginBottom: Theme.spacing.lg },
  card: {
    backgroundColor: Theme.screen.surface,
    borderRadius: Theme.radius.lg,
    padding: Theme.spacing.lg,
    marginBottom: Theme.spacing.md,
    borderWidth: 1,
    borderColor: Colors.gray[100],
    ...Theme.shadow.soft,
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowLeft: { flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 },
  iconWrap: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontFamily: Fonts.outfit.medium, fontSize: 16, color: Colors.gray[900] },
  rowSub: { fontFamily: Fonts.outfit.regular, fontSize: 12, color: Colors.gray[500], marginTop: 2 },
  linkRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: Theme.spacing.lg, paddingTop: Theme.spacing.lg, borderTopWidth: 1, borderTopColor: Colors.gray[100] },
  linkText: { fontFamily: Fonts.outfit.medium, fontSize: 15, color: Colors.brand },
  tip: { flexDirection: 'row', gap: 10, backgroundColor: withOpacity(Colors.info, 0.08), padding: 14, borderRadius: Theme.radius.md, borderWidth: 1, borderColor: withOpacity(Colors.info, 0.15) },
  tipText: { flex: 1, fontFamily: Fonts.outfit.regular, fontSize: 14, color: Colors.info, lineHeight: 20 },
});
