/**
 * Cache local para conexão fraca (§7): a última resposta boa de cada tela fica guardada e
 * é mostrada quando a rede falha, com aviso de que pode estar desatualizada.
 * O armazenamento é injetado (AsyncStorage no app), então a lógica é testável.
 */

export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export interface Cached<T> {
  data: T;
  /** true quando veio do cache porque a rede falhou. */
  offline: boolean;
  savedAt: string;
}

export async function fetchWithCache<T>(
  store: KeyValueStore,
  key: string,
  load: () => Promise<T>,
  isNetworkError: (error: unknown) => boolean,
): Promise<Cached<T>> {
  try {
    const data = await load();
    const savedAt = new Date().toISOString();
    await store.setItem(key, JSON.stringify({ data, savedAt }));
    return { data, offline: false, savedAt };
  } catch (error) {
    if (!isNetworkError(error)) throw error;
    const raw = await store.getItem(key);
    if (!raw) throw error;
    const cached = JSON.parse(raw) as { data: T; savedAt: string };
    return { data: cached.data, offline: true, savedAt: cached.savedAt };
  }
}
