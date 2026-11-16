import { describe, expect, it } from 'vitest';
import { ApiClient, SessionExpiredError, type Tokens, type TokenStore } from './api-client';

function memoryStore(initial: Tokens | null): TokenStore & { current: Tokens | null } {
  const store = {
    current: initial,
    load: () => Promise.resolve(store.current),
    save: (t: Tokens) => {
      store.current = t;
      return Promise.resolve();
    },
    clear: () => {
      store.current = null;
      return Promise.resolve();
    },
  };
  return store;
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('ApiClient', () => {
  it('renova uma vez só com várias chamadas simultâneas e repete com o token novo', async () => {
    let refreshes = 0;
    const store = memoryStore({ accessToken: 'velho', refreshToken: 'r1' });
    const http = ((url: string, init?: RequestInit) => {
      if (url.endsWith('/auth/refresh')) {
        refreshes++;
        return Promise.resolve(json(200, { accessToken: 'novo', refreshToken: 'r2' }));
      }
      const auth = (init?.headers as Record<string, string>).authorization;
      return Promise.resolve(auth === 'Bearer novo' ? json(200, { ok: true }) : json(401, {}));
    }) as typeof fetch;
    const client = new ApiClient('http://api', store, http);

    const results = await Promise.all([
      client.request('/a'),
      client.request('/b'),
      client.request('/c'),
    ]);
    expect(results).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(refreshes).toBe(1);
    expect(store.current).toEqual({ accessToken: 'novo', refreshToken: 'r2' });
  });

  it('refresh recusado apaga a sessão e avisa para entrar de novo', async () => {
    const store = memoryStore({ accessToken: 'velho', refreshToken: 'r1' });
    const http = (() => Promise.resolve(json(401, {}))) as typeof fetch;
    const client = new ApiClient('http://api', store, http);
    await expect(client.request('/me')).rejects.toBeInstanceOf(SessionExpiredError);
    expect(store.current).toBeNull();
  });

  it('envia a gestora em contexto e mostra a mensagem de erro da API', async () => {
    const store = memoryStore({ accessToken: 't', refreshToken: 'r' });
    let gestora: string | undefined;
    const http = ((_: string, init?: RequestInit) => {
      gestora = (init?.headers as Record<string, string>)['x-gestora-id'];
      return Promise.resolve(json(403, { message: 'Sem permissão' }));
    }) as typeof fetch;
    const client = new ApiClient('http://api', store, http);
    await expect(client.request('/x', { gestoraId: 'g1' })).rejects.toThrow('Sem permissão');
    expect(gestora).toBe('g1');
  });
});
