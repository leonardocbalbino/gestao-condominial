/**
 * Cliente da API para o app, sem dependência de React Native (testável com Vitest).
 * Guarda os tokens num armazenamento injetado (SecureStore no app) e renova a sessão uma
 * única vez quando o access token vence, mesmo com várias chamadas ao mesmo tempo (a API
 * revoga a sessão se o mesmo refresh token for usado duas vezes).
 */

export interface Tokens {
  accessToken: string;
  refreshToken: string;
}

export interface TokenStore {
  load(): Promise<Tokens | null>;
  save(tokens: Tokens): Promise<void>;
  clear(): Promise<void>;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Sessão encerrada (refresh recusado): o app volta para a tela de entrar. */
export class SessionExpiredError extends ApiError {
  constructor() {
    super(401, 'Sua sessão terminou. Entre de novo.');
  }
}

type Fetch = typeof fetch;

export class ApiClient {
  private refreshing: Promise<Tokens | null> | null = null;

  constructor(
    private readonly baseUrl: string,
    private readonly store: TokenStore,
    private readonly http: Fetch = (input, init) => fetch(input, init),
  ) {}

  async request<T>(
    path: string,
    options: { method?: string; body?: unknown; gestoraId?: string; anonymous?: boolean } = {},
  ): Promise<T> {
    const send = async (tokens: Tokens | null) => {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (tokens) headers.authorization = `Bearer ${tokens.accessToken}`;
      if (options.gestoraId) headers['x-gestora-id'] = options.gestoraId;
      return this.http(`${this.baseUrl}${path}`, {
        method: options.method ?? 'GET',
        headers,
        ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
      });
    };

    let tokens = options.anonymous ? null : await this.store.load();
    if (!options.anonymous && !tokens) throw new SessionExpiredError();
    let response = await send(tokens);
    if (response.status === 401 && tokens) {
      tokens = await this.refresh(tokens);
      if (!tokens) throw new SessionExpiredError();
      response = await send(tokens);
    }
    const text = await response.text();
    const data = text ? (JSON.parse(text) as { message?: string | string[] }) : undefined;
    if (!response.ok) {
      const message = Array.isArray(data?.message) ? data.message.join('; ') : data?.message;
      throw new ApiError(response.status, message ?? `Erro ${response.status}`);
    }
    return data as T;
  }

  /** Troca o refresh token uma vez; quem chamar junto recebe o mesmo resultado. */
  refresh(current: Tokens): Promise<Tokens | null> {
    if (!this.refreshing) {
      this.refreshing = this.http(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken: current.refreshToken }),
      })
        .then(async (r) => {
          if (!r.ok) {
            await this.store.clear();
            return null;
          }
          const next = (await r.json()) as Tokens;
          await this.store.save({ accessToken: next.accessToken, refreshToken: next.refreshToken });
          return next;
        })
        .finally(() => {
          this.refreshing = null;
        });
    }
    return this.refreshing;
  }
}
