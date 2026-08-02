import * as SecureStore from 'expo-secure-store';

const PUSH_TOKEN_KEY = 'cotici_push_token';
const PUSH_DEVICE_ID_KEY = 'cotici_push_device_id';
const PUSH_PRIMING_SHOWN_KEY = 'cotici_push_priming_shown';

/** Génère un identifiant d'appareil stable (v4-like), sans dépendance native
 * supplémentaire — suffisant pour distinguer les installations côté backend. */
function generateDeviceId(): string {
  const rand = () => Math.floor(Math.random() * 16).toString(16);
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    if (c === 'x') return rand();
    const r = Math.floor(Math.random() * 4) + 8; // 8,9,a,b
    return r.toString(16);
  });
}

export async function getOrCreatePushDeviceId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(PUSH_DEVICE_ID_KEY);
  if (existing) return existing;
  const id = generateDeviceId();
  await SecureStore.setItemAsync(PUSH_DEVICE_ID_KEY, id);
  return id;
}

export async function getStoredPushToken(): Promise<string | null> {
  return SecureStore.getItemAsync(PUSH_TOKEN_KEY);
}

export async function savePushToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(PUSH_TOKEN_KEY, token);
}

export async function clearPushToken(): Promise<void> {
  await SecureStore.deleteItemAsync(PUSH_TOKEN_KEY);
}

/** Le priming (écran d'explication avant la demande de permission système) ne
 * doit être montré qu'une seule fois, quel que soit le résultat. */
export async function hasShownPushPriming(): Promise<boolean> {
  const value = await SecureStore.getItemAsync(PUSH_PRIMING_SHOWN_KEY);
  return value === '1';
}

export async function markPushPrimingShown(): Promise<void> {
  await SecureStore.setItemAsync(PUSH_PRIMING_SHOWN_KEY, '1');
}
