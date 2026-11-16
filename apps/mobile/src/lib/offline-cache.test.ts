import { describe, expect, it } from 'vitest';
import { fetchWithCache, type KeyValueStore } from './offline-cache';

const memory = (): KeyValueStore => {
  const map = new Map<string, string>();
  return {
    getItem: (k) => Promise.resolve(map.get(k) ?? null),
    setItem: (k, v) => {
      map.set(k, v);
      return Promise.resolve();
    },
  };
};

const network = new TypeError('Network request failed');
const isNetwork = (e: unknown) => e === network;

describe('fetchWithCache', () => {
  it('sem rede, mostra a última resposta guardada e avisa que é offline', async () => {
    const store = memory();
    await fetchWithCache(store, 'boletos', () => Promise.resolve([1, 2]), isNetwork);
    const offline = await fetchWithCache(
      store,
      'boletos',
      () => Promise.reject(network),
      isNetwork,
    );
    expect(offline).toMatchObject({ data: [1, 2], offline: true });
  });

  it('erro que não é de rede (ex.: sem permissão) não é escondido pelo cache', async () => {
    const store = memory();
    await fetchWithCache(store, 'x', () => Promise.resolve('ok'), isNetwork);
    await expect(
      fetchWithCache(store, 'x', () => Promise.reject(new Error('403')), isNetwork),
    ).rejects.toThrow('403');
  });

  it('sem rede e sem cache, o erro aparece', async () => {
    await expect(
      fetchWithCache(memory(), 'y', () => Promise.reject(network), isNetwork),
    ).rejects.toBe(network);
  });
});
