import 'server-only';
import type { MeDto } from '@condo/contracts';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import { UserError } from './action-state';
import { COOKIES } from './session';

const API_URL = process.env.API_URL ?? 'http://localhost:3333';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: { message?: string | string[]; issues?: { path: string; message: string }[] },
  ) {
    super(
      Array.isArray(body.message) ? body.message.join('; ') : (body.message ?? `Erro ${status}`),
    );
  }
}

interface ApiOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  form?: FormData;
  /** Gestora em contexto (x-gestora-id). Padrão: a escolhida no cookie. */
  gestoraId?: string | null;
  /** Sem token (login, link mágico). */
  anonymous?: boolean;
}

/**
 * Chamada à API do lado do servidor, com o token do cookie. 401 manda para o login
 * (o proxy já tentou renovar a sessão antes desta requisição).
 */
export async function api<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const jar = await cookies();
  const headers: Record<string, string> = {};
  if (!options.anonymous) {
    const token = jar.get(COOKIES.access)?.value;
    if (!token) redirect('/entrar');
    headers.authorization = `Bearer ${token}`;
  }
  const gestoraId =
    options.gestoraId === undefined ? jar.get(COOKIES.gestora)?.value : options.gestoraId;
  if (gestoraId) headers['x-gestora-id'] = gestoraId;

  let body: BodyInit | undefined;
  if (options.form) {
    body = options.form;
  } else if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  const response = await fetch(`${API_URL}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body,
    cache: 'no-store',
  });
  if (response.status === 401 && !options.anonymous) redirect('/entrar');
  const text = await response.text();
  const data = text ? (JSON.parse(text) as unknown) : undefined;
  if (!response.ok) throw new ApiError(response.status, (data ?? {}) as ApiError['body']);
  return data as T;
}

/** Usuário logado e suas gestoras/papéis (uma vez por requisição). */
export const getMe = cache(() => api<MeDto>('/me', { gestoraId: null }));

/** Gestora, síndico, conselho ou papel customizado: qualquer papel acima da unidade. */
export function isStaff(me: MeDto): boolean {
  return me.gestoras.some((g) => g.roles.some((r) => r.scope.type !== 'unit'));
}

/** Gestoras onde a pessoa atua como equipe (painel). */
export function staffGestoras(me: MeDto) {
  return me.gestoras.filter((g) => g.roles.some((r) => r.scope.type !== 'unit'));
}

/** Unidades onde a pessoa é moradora (escopo de unidade), em todas as gestoras. */
export function myUnits(me: MeDto) {
  return me.gestoras.flatMap((g) =>
    g.roles.flatMap((r) =>
      r.scope.type === 'unit'
        ? [
            {
              gestoraId: g.id,
              gestoraNome: g.nome,
              condominioId: r.scope.condominioId,
              unitId: r.scope.unitId,
            },
          ]
        : [],
    ),
  );
}

/**
 * Mensagem amigável a partir de um erro da API ou de validação do formulário. Qualquer
 * outro erro é relançado (não vaza detalhe interno para a tela).
 */
export function errorMessage(error: unknown): string {
  if (error instanceof UserError) return error.message;
  if (error instanceof ApiError) {
    if (error.status === 403) return 'Você não tem permissão para esta ação.';
    const issues = error.body.issues?.map((i) => (i.path ? `${i.path}: ${i.message}` : i.message));
    return issues?.length ? `${error.message} — ${issues.join('; ')}` : error.message;
  }
  throw error;
}
