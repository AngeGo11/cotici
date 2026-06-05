import 'react-native-reanimated';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import {
  SpaceGrotesk_400Regular,
  SpaceGrotesk_500Medium,
  SpaceGrotesk_600SemiBold,
  SpaceGrotesk_700Bold,
} from '@expo-google-fonts/space-grotesk';
import {
  Outfit_300Light,
  Outfit_400Regular,
  Outfit_500Medium,
  Outfit_600SemiBold,
  Outfit_700Bold,
} from '@expo-google-fonts/outfit';
import { AuthProvider } from '@/shared/auth';
import { stackModalScreenOptions, stackScreenOptions } from '@/shared/ui';

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    SpaceGrotesk_400Regular,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_600SemiBold,
    SpaceGrotesk_700Bold,
    Outfit_300Light,
    Outfit_400Regular,
    Outfit_500Medium,
    Outfit_600SemiBold,
    Outfit_700Bold,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <StatusBar style="dark" />
        <Stack screenOptions={stackScreenOptions}>
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="create-account" />
        <Stack.Screen name="otp" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="tontine-details" />
        <Stack.Screen name="savings-detail" />
        <Stack.Screen name="solidarity" />
        <Stack.Screen name="chat" />
        <Stack.Screen name="admin" />
        <Stack.Screen
          name="definir-ordre-ramassage"
          options={stackModalScreenOptions}
        />
        <Stack.Screen name="modifier-regles" />
        <Stack.Screen name="exclure-membre" />
        <Stack.Screen name="create-savings" />
        <Stack.Screen name="create-classic-tontine" />
        <Stack.Screen name="create-solidarity-tontine" />
        <Stack.Screen name="solidarity-share" />
        <Stack.Screen name="solidarity-collect/[id]" />
        <Stack.Screen name="create-personal-goal" />
        <Stack.Screen name="modifier-objectif" />
        <Stack.Screen name="create-association-fund" />
        <Stack.Screen name="choose-tontine-cotisation" />
        <Stack.Screen name="make-deposit" options={stackModalScreenOptions} />
        <Stack.Screen name="deposit-to-account" options={stackModalScreenOptions} />
        <Stack.Screen name="retrait" options={stackModalScreenOptions} />
        <Stack.Screen name="activites-recentes" />
        <Stack.Screen name="prochaines-echeances" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="invitations" />
        <Stack.Screen name="join-tontine-rules" />
        <Stack.Screen name="new-invitation" />
        <Stack.Screen name="activite/[id]" />
        <Stack.Screen name="add-to-savings" />
        <Stack.Screen name="success" options={stackModalScreenOptions} />
        <Stack.Screen name="nav-preview" />
        <Stack.Screen name="security" />
        <Stack.Screen name="help-support" />
        <Stack.Screen name="terms" />
        <Stack.Screen name="solidarity-rules" />
        <Stack.Screen name="savings-history" />
        <Stack.Screen name="solidarity-aid-history" />
        <Stack.Screen name="edit-profile" />
        </Stack>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
