import AsyncStorage from '@react-native-async-storage/async-storage';
import type { AuthStepResult, MeDto } from '@condo/contracts';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ApiClient, type Tokens, type TokenStore } from './api-client';
import { fetchWithCache, type Cached } from './offline-cache';

/** URL da API: EXPO_PUBLIC_API_URL no build (homologação, produção). */
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3333';

const TOKENS_KEY = 'condo.tokens';

/** Tokens no armazenamento seguro do sistema (Keychain/Keystore), nunca em AsyncStorage. */
const secureTokens: TokenStore = {
  async load() {
    const raw = await SecureStore.getItemAsync(TOKENS_KEY);
    return raw ? (JSON.parse(raw) as Tokens) : null;
  },
  save: (tokens) => SecureStore.setItemAsync(TOKENS_KEY, JSON.stringify(tokens)),
  clear: () => SecureStore.deleteItemAsync(TOKENS_KEY),
};

export const api = new ApiClient(API_URL, secureTokens);

const isNetworkError = (error: unknown) => error instanceof TypeError;

/** GET com cache local (§7: boletos e comunicados disponíveis com conexão fraca). */
export function cachedGet<T>(path: string, gestoraId: string): Promise<Cached<T>> {
  return fetchWithCache(
    AsyncStorage,
    `cache:${path}`,
    () => api.request<T>(path, { gestoraId }),
    isNetworkError,
  );
}

export interface MyUnit {
  gestoraId: string;
  gestoraNome: string;
  condominioId: string;
  unitId: string;
  primaryColor?: string;
}

type Status = 'loading' | 'locked' | 'signed-out' | 'signed-in';

interface SessionValue {
  status: Status;
  me: MeDto | null;
  unit: MyUnit | null;
  /** Abre a sessão guardada com digital/rosto. */
  unlock: () => Promise<void>;
  /** Conclui um passo de login (link mágico). */
  complete: (result: AuthStepResult) => Promise<string | null>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

function unitsOf(me: MeDto): MyUnit[] {
  return me.gestoras.flatMap((g) =>
    g.roles.flatMap((r) =>
      r.scope.type === 'unit'
        ? [
            {
              gestoraId: g.id,
              gestoraNome: g.nome,
              condominioId: r.scope.condominioId,
              unitId: r.scope.unitId,
              ...(g.branding.primaryColor ? { primaryColor: g.branding.primaryColor } : {}),
            },
          ]
        : [],
    ),
  );
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading');
  const [me, setMe] = useState<MeDto | null>(null);

  const loadMe = useCallback(async () => {
    const result = await api.request<MeDto>('/me');
    setMe(result);
    setStatus('signed-in');
  }, []);

  // Com sessão guardada, pede biometria antes de abrir (se o aparelho tiver).
  useEffect(() => {
    void (async () => {
      const tokens = await secureTokens.load();
      if (!tokens) return setStatus('signed-out');
      const hasBiometrics =
        (await LocalAuthentication.hasHardwareAsync()) &&
        (await LocalAuthentication.isEnrolledAsync());
      if (hasBiometrics) setStatus('locked');
      else await loadMe().catch(() => setStatus('signed-out'));
    })();
  }, [loadMe]);

  const value = useMemo<SessionValue>(
    () => ({
      status,
      me,
      unit: me ? (unitsOf(me)[0] ?? null) : null,
      async unlock() {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Entrar no Meu Condomínio',
          cancelLabel: 'Usar link no e-mail',
        });
        if (result.success) await loadMe().catch(() => setStatus('signed-out'));
      },
      async complete(result) {
        if (result.status !== 'authenticated') {
          return 'Sua conta exige verificação em duas etapas. Entre pelo site.';
        }
        await secureTokens.save({
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
        });
        await loadMe();
        return null;
      },
      async signOut() {
        const tokens = await secureTokens.load();
        if (tokens) {
          await api
            .request('/auth/logout', {
              method: 'POST',
              anonymous: true,
              body: { refreshToken: tokens.refreshToken },
            })
            .catch(() => undefined);
        }
        await secureTokens.clear();
        setMe(null);
        setStatus('signed-out');
      },
    }),
    [status, me, loadMe],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession fora do SessionProvider');
  return value;
}
