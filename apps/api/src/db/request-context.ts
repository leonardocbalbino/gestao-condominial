import { AsyncLocalStorage } from 'node:async_hooks';
import { sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { schema } from './schema';

export type Database = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface RequestContext {
  tx: Tx;
  /** Gestora em contexto (app.gestora_id). Nulo em rotas sem tenant (login, /me). */
  gestoraId: string | null;
  userId: string | null;
  /** O access token foi emitido após segundo fator. */
  mfa: boolean;
  ip: string | null;
  requestId: string | null;
  /**
   * Escopos ltree onde o usuário tem a permissão da rota, quando a regra é de escopo
   * "qualquer" (listagens). Serviços filtram por eles sem depender do módulo identity.
   */
  permissionScopes: string[];
  /** Quantas linhas de auditoria esta requisição gravou (mutação sem auditoria é rejeitada). */
  auditCount: number;
  /** Executados só depois do COMMIT (ex.: envio de e-mail). */
  afterCommit: (() => Promise<void>)[];
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Contexto da requisição atual. Lança se chamado fora de uma transação de request. */
export function currentContext(): RequestContext {
  const ctx = storage.getStore();
  if (!ctx) {
    throw new Error('Acesso ao banco fora de um contexto de requisição');
  }
  return ctx;
}

/** Atalho para a transação da requisição atual. */
export function currentTx(): Tx {
  return currentContext().tx;
}

/**
 * Vincula o usuário à transação corrente depois que ele foi identificado no meio da
 * requisição (login, link mágico). Atualiza app.user_id (RLS) e o ator da auditoria.
 */
export async function bindUser(userId: string): Promise<void> {
  const ctx = currentContext();
  await ctx.tx.execute(sql`SELECT set_config('app.user_id', ${userId}, true)`);
  ctx.userId = userId;
}

export interface ContextInput {
  gestoraId: string | null;
  userId: string | null;
  mfa: boolean;
  ip: string | null;
  requestId: string | null;
}

/**
 * Abre uma transação, seta o contexto de tenant com escopo de transação (SET LOCAL via
 * set_config(..., true)) e executa `fn` com esse contexto disponível. Os hooks
 * `afterCommit` rodam após o COMMIT; em erro, a transação inteira (inclusive auditoria) é desfeita.
 */
export async function runInContext<T>(
  db: Database,
  input: ContextInput,
  fn: () => Promise<T>,
): Promise<T> {
  let ctx: RequestContext | undefined;
  const result = await db.transaction(async (tx) => {
    await tx.execute(
      sql`SELECT set_config('app.gestora_id', ${input.gestoraId ?? ''}, true),
                 set_config('app.user_id', ${input.userId ?? ''}, true)`,
    );
    ctx = { ...input, tx, permissionScopes: [], auditCount: 0, afterCommit: [] };
    return storage.run(ctx, fn);
  });
  for (const hook of ctx?.afterCommit ?? []) {
    await hook();
  }
  return result;
}
