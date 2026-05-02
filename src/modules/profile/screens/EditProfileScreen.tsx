import { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, ScrollView, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import { Colors } from '@/shared/theme/Colors';
import { Fonts } from '@/shared/theme/Fonts';
import { Theme } from '@/shared/theme/Theme';

export default function EditProfileScreen() {
  const router = useRouter();
  const [name, setName] = useState('Marie Koné');
  const [phone, setPhone] = useState('07 12 34 56 78');

  const save = () => {
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
          <Text style={styles.headerTitle}>Modifier le profil</Text>
          <View style={styles.backButton} />
        </View>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.field}>
            <Text style={styles.label}>Nom complet</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="Votre nom"
              placeholderTextColor={Colors.gray[400]}
              style={styles.input}
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Téléphone</Text>
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder="07 XX XX XX XX"
              placeholderTextColor={Colors.gray[400]}
              keyboardType="phone-pad"
              style={styles.input}
            />
          </View>
          <Text style={styles.hint}>Les changements seront enregistrés sur cet appareil (démo).</Text>
          <TouchableOpacity style={styles.saveButton} onPress={save} activeOpacity={0.9}>
            <Text style={styles.saveText}>Enregistrer</Text>
          </TouchableOpacity>
          <View style={{ height: 40 }} />
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
    paddingVertical: Theme.spacing.sm,
  },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: Theme.screen.surface, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontFamily: Fonts.spaceGrotesk.bold, fontSize: 18, color: Colors.gray[900] },
  scroll: { paddingHorizontal: Theme.spacing.page, paddingBottom: 32, paddingTop: 8 },
  field: { marginBottom: Theme.spacing.lg },
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
  hint: { fontFamily: Fonts.outfit.regular, fontSize: 13, color: Colors.gray[500], marginBottom: Theme.spacing.lg, lineHeight: 20 },
  saveButton: {
    backgroundColor: Colors.brand,
    paddingVertical: 16,
    borderRadius: Theme.radius.md,
    alignItems: 'center',
  },
  saveText: { fontFamily: Fonts.outfit.medium, fontSize: 16, color: Colors.white },
});
