import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { registerPushDevice, unregisterPushDevice } from '@/shared/api';
import { Colors } from '@/shared/theme/Colors';
import {
  clearPushToken,
  getOrCreatePushDeviceId,
  getStoredPushToken,
  savePushToken,
} from './pushStorage';

export type PushPermissionStatus = 'granted' | 'denied' | 'undetermined' | 'unsupported';

/**
 * `expo-notifications` type `NotificationPermissionsStatus` étend
 * `PermissionResponse` (défini dans `expo-modules-core`), un module que ce
 * projet ne peut pas résoudre en type-checking (dépendance transitive non
 * hissée par npm — cf. `node_modules/expo/node_modules/expo-modules-core`).
 * Le champ `status` existe bien à l'exécution ; on le lit ici via une
 * frontière de type explicite plutôt que de dépendre de ce type cassé.
 */
function readPermissionStatus(response: object): 'granted' | 'denied' | 'undetermined' {
  const status = (response as { status?: string }).status;
  if (status === 'granted' || status === 'denied' || status === 'undetermined') {
    return status;
  }
  return 'undetermined';
}

/** Simulateur / émulateur : les push ne fonctionnent pas, on ne doit jamais planter. */
export function isPushCapableDevice(): boolean {
  return Device.isDevice;
}

function resolveProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId ??
    undefined
  );
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Notifications COTICI',
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 200, 150, 200],
    lightColor: Colors.brand,
  });
}

export async function getPushPermissionStatus(): Promise<PushPermissionStatus> {
  if (!isPushCapableDevice()) return 'unsupported';
  try {
    const response = await Notifications.getPermissionsAsync();
    return readPermissionStatus(response);
  } catch {
    return 'undetermined';
  }
}

/** Récupère le token Expo Push et l'enregistre auprès du backend. À n'appeler
 * qu'après avoir vérifié que la permission est accordée. Ne lève jamais
 * d'exception : simulateur, réseau indisponible, projectId manquant sont tous
 * gérés en silence (retour `false`). */
export async function registerDeviceToken(): Promise<boolean> {
  if (!isPushCapableDevice()) return false;
  const projectId = resolveProjectId();
  if (!projectId) {
    console.warn(
      '[push] extra.eas.projectId manquant dans app.json — impossible de générer un token Expo Push.',
    );
    return false;
  }
  try {
    await ensureAndroidChannel();
    const { data: expoToken } = await Notifications.getExpoPushTokenAsync({ projectId });
    const deviceId = await getOrCreatePushDeviceId();
    const platform = Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web';
    const result = await registerPushDevice({
      expo_token: expoToken,
      device_id: deviceId,
      platform,
      app_version: Constants.expoConfig?.version ?? '0.0.0',
    });
    if (!result.ok) return false;
    await savePushToken(expoToken);
    return true;
  } catch (error) {
    console.warn('[push] Échec de l’enregistrement du token push.', error);
    return false;
  }
}

/** Déclenche le prompt système iOS/Android si nécessaire, puis enregistre le
 * token en cas d'acceptation. Ne redemande jamais après un refus explicite
 * (impossible techniquement) : appeler uniquement depuis un geste utilisateur
 * volontaire (écran de priming). */
export async function requestPushPermissionAndRegister(): Promise<{ granted: boolean }> {
  if (!isPushCapableDevice()) return { granted: false };
  try {
    const current = await Notifications.getPermissionsAsync();
    let status = readPermissionStatus(current);
    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = readPermissionStatus(requested);
    }
    if (status !== 'granted') return { granted: false };
    await registerDeviceToken();
    return { granted: true };
  } catch {
    return { granted: false };
  }
}

/** À appeler au logout : désinscrit ce token du backend pour ne plus recevoir
 * de push une fois déconnecté, puis nettoie le stockage local. */
export async function unregisterDeviceToken(): Promise<void> {
  const token = await getStoredPushToken();
  if (!token) return;
  await unregisterPushDevice(token).catch(() => {});
  await clearPushToken();
}
