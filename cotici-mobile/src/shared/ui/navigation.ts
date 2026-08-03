import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';
import { Theme } from '@/shared/theme/Theme';

/** Options partagées pour les transitions de pile (expo-router Stack). */
export const stackScreenOptions: NativeStackNavigationOptions = {
  headerShown: false,
  contentStyle: { backgroundColor: Theme.screen.bg },
  animation: 'slide_from_right',
  animationDuration: 280,
  gestureEnabled: true,
  fullScreenGestureEnabled: true,
};

/** Écrans modaux / feuilles (succès, dépôt, etc.). */
export const stackModalScreenOptions: NativeStackNavigationOptions = {
  ...stackScreenOptions,
  animation: 'fade_from_bottom',
  animationDuration: 320,
};
