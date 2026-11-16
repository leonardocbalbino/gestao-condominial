import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { SessionExpiredError } from './lib/api-client';
import type { Cached } from './lib/offline-cache';
import { cachedGet, useSession } from './lib/session';

/** Carrega um recurso da unidade em uso, com cache offline e "puxar para atualizar". */
export function useUnitResource<T>(suffix: string) {
  const { unit, signOut } = useSession();
  const [state, setState] = useState<Cached<T> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const reload = useCallback(async () => {
    if (!unit) return;
    setLoading(true);
    try {
      const path = `/condominios/${unit.condominioId}/units/${unit.unitId}${suffix}`;
      setState(await cachedGet<T>(path, unit.gestoraId));
      setError(null);
    } catch (e) {
      if (e instanceof SessionExpiredError) {
        await signOut();
        router.replace('/entrar');
        return;
      }
      setError('Não foi possível carregar agora. Puxe a tela para tentar de novo.');
    } finally {
      setLoading(false);
    }
  }, [unit, suffix, signOut]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return {
    data: state?.data ?? null,
    offline: state?.offline ? state.savedAt : null,
    error,
    loading,
    reload,
  };
}
