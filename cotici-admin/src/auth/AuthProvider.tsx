import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiError, api } from '@/lib/api/client';
import { endpoints } from '@/lib/api/endpoints';
import { ensureCsrfToken, resetCsrfBootstrap } from '@/lib/api/csrf';
import type { AdminMe, LoginResponse, TotpSetupResponse } from '@/lib/api/types';
import { hasAllPermissions, hasAnyPermission, type Permission } from '@/lib/permissions';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

/** Etape intermediaire du parcours de connexion (mot de passe -> TOTP). */
export type PendingStage = 'totp_required' | 'totp_setup_required' | null;

export interface AuthContextValue {
  status: AuthStatus;
  user: AdminMe | null;
  /** Etape 2FA en attente apres validation du mot de passe. */
  pendingStage: PendingStage;
  /** URI d'enrolement TOTP, disponible uniquement lors d'un premier setup. */
  provisioningUri: string | null;
  totpSecret: string | null;

  login: (username: string, password: string) => Promise<LoginResponse>;
  verifyTotp: (code: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;

  /** Helpers d'affichage — la verification qui fait foi est cote serveur. */
  can: (permission: Permission) => boolean;
  canAny: (permissions: Permission[]) => boolean;
  canAll: (permissions: Permission[]) => boolean;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Fournit la session staff.
 *
 * Aucun jeton n'est stocke en JavaScript : l'authentification repose sur le
 * cookie de session HttpOnly pose par Django, accompagne du jeton CSRF.
 * L'etat local ne contient que le profil renvoye par GET /api/admin/me/.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AdminMe | null>(null);
  const [pendingStage, setPendingStage] = useState<PendingStage>(null);
  const [provisioningUri, setProvisioningUri] = useState<string | null>(null);
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const loadSession = useCallback(async () => {
    try {
      // Sonde de session : un 401/403 signifie "pas encore connecte", ce n'est
      // ni une redirection a declencher ni un toast a afficher.
      const me = await api.get<AdminMe>(endpoints.me, {
        skipAuthRedirect: true,
        skipForbiddenToast: true,
      });
      setUser(me);
      setStatus('authenticated');
    } catch (error) {
      setUser(null);
      // Un 401 signifie simplement "pas de session" : ce n'est pas une panne.
      setStatus('anonymous');
      if (!(error instanceof ApiError)) {
        console.error('Chargement de la session impossible', error);
      }
    }
  }, []);

  useEffect(() => {
    // Amorce le cookie CSRF puis tente de restaurer une session existante.
    void ensureCsrfToken().then(loadSession);
  }, [loadSession]);

  const login = useCallback(async (username: string, password: string) => {
    await ensureCsrfToken();
    // Le backend attend `identifiant` et repond {totp_setup_required: bool} ;
    // le cookie de pre-authentification (TTL court) est pose au passage.
    const response = await api.post<LoginResponse>(
      endpoints.auth.login,
      { identifiant: username, password },
      { skipAuthRedirect: true, skipForbiddenToast: true },
    );
    // Second facteur desactive cote serveur : la session est deja ouverte,
    // il n'y a aucune etape TOTP a franchir.
    if (response?.session_established) {
      setPendingStage(null);
      setProvisioningUri(null);
      setTotpSecret(null);
      await loadSession();
      return { ...response, stage: undefined };
    }

    const stage: Exclude<PendingStage, null> = response?.totp_setup_required
      ? 'totp_setup_required'
      : 'totp_required';
    setPendingStage(stage);

    // Premier enrolement : le secret vient d'un appel dedie a /totp/setup/.
    if (stage === 'totp_setup_required') {
      const setup = await api.post<TotpSetupResponse>(
        endpoints.auth.totpSetup,
        {},
        { skipAuthRedirect: true, skipForbiddenToast: true },
      );
      setProvisioningUri(setup?.otpauth_url ?? null);
      setTotpSecret(setup?.secret ?? null);
      return { ...response, stage, secret: setup?.secret, provisioning_uri: setup?.otpauth_url };
    }

    setProvisioningUri(null);
    setTotpSecret(null);
    return { ...response, stage };
  }, []);

  const verifyTotp = useCallback(
    async (code: string) => {
      // 204 + cookie de session en cas de succes.
      await api.post<void>(
        endpoints.auth.totpVerify,
        { code },
        { skipAuthRedirect: true, skipForbiddenToast: true },
      );
      setPendingStage(null);
      setProvisioningUri(null);
      setTotpSecret(null);
      await loadSession();
    },
    [loadSession],
  );

  const logout = useCallback(async () => {
    try {
      await api.post<void>(endpoints.auth.logout, undefined, { skipAuthRedirect: true });
    } catch {
      // Meme en cas d'echec reseau, on purge l'etat local.
    } finally {
      setUser(null);
      setStatus('anonymous');
      setPendingStage(null);
      setProvisioningUri(null);
      setTotpSecret(null);
      resetCsrfBootstrap();
      // Les donnees mises en cache peuvent contenir des informations sensibles.
      queryClient.clear();
    }
  }, [queryClient]);

  const value = useMemo<AuthContextValue>(() => {
    const permissions = user?.permissions ?? [];
    return {
      status,
      user,
      pendingStage,
      provisioningUri,
      totpSecret,
      login,
      verifyTotp,
      logout,
      refresh: loadSession,
      can: (permission) => permissions.includes(permission),
      canAny: (required) => hasAnyPermission(permissions, required),
      canAll: (required) => hasAllPermissions(permissions, required),
    };
  }, [
    status,
    user,
    pendingStage,
    provisioningUri,
    totpSecret,
    login,
    verifyTotp,
    logout,
    loadSession,
  ]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
