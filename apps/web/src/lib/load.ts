import 'server-only';
import { api, ApiError } from './api';
import { staffContext } from './context';

/**
 * GET no contexto da gestora do painel. Recursos que ainda não existem (404) ou que a
 * pessoa não pode ver (403) viram `null`, para a página mostrar só o que cabe a ela.
 */
export async function load<T>(path: string): Promise<T | null> {
  const { gestora } = await staffContext();
  try {
    return await api<T>(path, { gestoraId: gestora.id });
  } catch (error) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 403)) return null;
    throw error;
  }
}
