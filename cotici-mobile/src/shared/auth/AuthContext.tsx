import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AuthUser } from './types';
import { parseAuthUser } from './types';
import { loadUserFromApi, refreshAccessToken } from './authApi';
import { loadCurrentUser, setSessionExpiredHandler } from './fetchWithAuth';
import { clearTokens, getAccessToken, getRefreshToken, saveTokens } from './tokenStorage';
import { unregisterDeviceToken } from '@/modules/notifications/services/pushRegistration';

type SignInPayload = {
  access: string;
  refresh: string;
  user: unknown;
};

type AuthContextValue = {
  user: AuthUser | null;
  isReady: boolean;
  signIn: (payload: SignInPayload) => Promise<void>;
  signOut: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isReady, setIsReady] = useState(false);

  const hydrate = useCallback(async () => {
    try {
      let access = await getAccessToken();
      const refresh = await getRefreshToken();

      if (!access && !refresh) {
        setUser(null);
        return;
      }

      if (access) {
        const me = await loadUserFromApi(access);
        if (me) {
          setUser(me);
          return;
        }
      }

      if (refresh) {
        const tokens = await refreshAccessToken(refresh);
        if (tokens) {
          await saveTokens(tokens.access, tokens.refresh);
          const me = await loadUserFromApi(tokens.access);
          if (me) {
            setUser(me);
            return;
          }
        }
      }

      await clearTokens();
      setUser(null);
    } finally {
      setIsReady(true);
    }
  }, []);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
    });
    return () => setSessionExpiredHandler(null);
  }, []);

  const signIn = useCallback(async ({ access, refresh, user: rawUser }: SignInPayload) => {
    await saveTokens(access, refresh);
    const parsed = parseAuthUser(rawUser);
    if (parsed) {
      setUser(parsed);
      return;
    }
    const me = await loadUserFromApi(access);
    setUser(me);
  }, []);

  const signOut = useCallback(async () => {
    // Désinscrire le token push AVANT de vider les tokens d'auth : l'appel
    // DELETE /devices/ nécessite encore un access token valide.
    await unregisterDeviceToken().catch(() => {});
    await clearTokens();
    setUser(null);
  }, []);

  const refreshUser = useCallback(async () => {
    const me = await loadCurrentUser();
    if (me) setUser(me);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isReady,
      signIn,
      signOut,
      refreshUser,
    }),
    [user, isReady, signIn, signOut, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth doit être utilisé dans un AuthProvider.');
  }
  return ctx;
}
