import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
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
import * as SplashScreen from 'expo-system-ui';
import { Colors } from '@/constants/Colors';
import { Theme } from '@/constants/Theme';

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
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Theme.screen.bg },
        }}
      >
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
        <Stack.Screen name="modifier-regles" />
        <Stack.Screen name="exclure-membre" />
        <Stack.Screen name="create-savings" />
        <Stack.Screen name="create-classic-tontine" />
        <Stack.Screen name="create-solidarity-tontine" />
        <Stack.Screen name="create-personal-goal" />
        <Stack.Screen name="modifier-objectif" />
        <Stack.Screen name="create-association-fund" />
        <Stack.Screen name="make-deposit" />
        <Stack.Screen name="deposit-to-account" />
        <Stack.Screen name="retrait" />
        <Stack.Screen name="activites-recentes" />
        <Stack.Screen name="prochaines-echeances" />
        <Stack.Screen name="notifications" />
        <Stack.Screen name="invitations" />
        <Stack.Screen name="new-invitation" />
        <Stack.Screen name="activite/[id]" />
        <Stack.Screen name="add-to-savings" />
        <Stack.Screen name="success" />
        <Stack.Screen name="nav-preview" />
        <Stack.Screen name="security" />
        <Stack.Screen name="help-support" />
        <Stack.Screen name="terms" />
        <Stack.Screen name="solidarity-rules" />
        <Stack.Screen name="savings-history" />
        <Stack.Screen name="solidarity-aid-history" />
        <Stack.Screen name="edit-profile" />
      </Stack>
    </>
  );
}
