import { randomUUID } from 'node:crypto';
import { hash } from '@node-rs/argon2';
import { Pool, type PoolClient } from 'pg';
import { SecretBox } from '../../src/common/crypto';
import { generateTotpSecret } from '../../src/common/totp';
import { condominioScope, gestoraScope } from '../../src/modules/identity/scope';

const env = (name: string): string => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} não definida no ambiente de teste`);
  return value;
};

let pools: { app: Pool; platform: Pool; admin: Pool } | undefined;

/** Conexões diretas: app_user (RLS), app_platform e superusuário (só para inspecionar/adulterar). */
export function testPools(): { app: Pool; platform: Pool; admin: Pool } {
  if (!pools) {
    const adminOnTestDb = new URL(env('DATABASE_ADMIN_URL'));
    adminOnTestDb.pathname = new URL(env('DATABASE_OWNER_URL')).pathname;
    pools = {
      app: new Pool({ connectionString: env('DATABASE_URL'), max: 5 }),
      platform: new Pool({ connectionString: env('DATABASE_PLATFORM_URL'), max: 5 }),
      admin: new Pool({ connectionString: adminOnTestDb.toString(), max: 3 }),
    };
  }
  return pools;
}

export async function closeTestPools(): Promise<void> {
  if (!pools) return;
  const current = pools;
  pools = undefined;
  await Promise.all([current.app.end(), current.platform.end(), current.admin.end()]);
}

/** Executa `fn` numa transação com o mesmo contexto que a API seta por requisição. */
export async function withContext<T>(
  pool: Pool,
  context: { gestoraId?: string | null; userId?: string | null },
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      "SELECT set_config('app.gestora_id', $1, true), set_config('app.user_id', $2, true)",
      [context.gestoraId ?? '', context.userId ?? ''],
    );
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/** CNPJ válido aleatório (dígitos verificadores calculados). */
export function randomCnpj(): string {
  const base = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10));
  const digit = (digits: number[], weights: number[]) => {
    const rest = digits.reduce((acc, d, i) => acc + d * (weights[i] ?? 0), 0) % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const d1 = digit(base, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = digit([...base, d1], [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return [...base, d1, d2].join('');
}

/** CPF válido aleatório (dígitos verificadores calculados). Fictício. */
export function randomCpf(): string {
  const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const digit = (digits: number[]) => {
    const factor = digits.length + 1;
    const rest = digits.reduce((acc, d, i) => acc + d * (factor - i), 0) % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const d1 = digit(base);
  const d2 = digit([...base, d1]);
  return [...base, d1, d2].join('');
}

/**
 * Espera o outbox da gestora esvaziar (eventos publicados e processados pelos workers).
 * Falha com o último erro se algum evento não for processado a tempo.
 */
export async function waitForOutbox(gestoraId: string, timeoutMs = 20_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const { rows } = await testPools().admin.query<{ topic: string; last_error: string | null }>(
      'SELECT topic, last_error FROM outbox_event WHERE gestora_id = $1 AND processed_at IS NULL',
      [gestoraId],
    );
    if (rows.length === 0) return;
    if (Date.now() > deadline) {
      throw new Error(`Outbox não esvaziou: ${JSON.stringify(rows)}`);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

export const uniqueEmail = (prefix: string): string =>
  `${prefix}-${randomUUID().slice(0, 8)}@teste.local`;

export async function createGestora(nome = `Gestora ${randomUUID().slice(0, 6)}`): Promise<string> {
  const { rows } = await testPools().platform.query<{ id: string }>(
    'INSERT INTO gestora (nome, cnpj) VALUES ($1, $2) RETURNING id',
    [nome, randomCnpj()],
  );
  return rows[0]?.id ?? '';
}

export interface TestUser {
  id: string;
  email: string;
  password: string;
  /** Segredo TOTP já ativado (quando `withTotp`). */
  totpSecret: string | null;
}

export async function createUser(
  options: { withTotp?: boolean; platformAdmin?: boolean; prefix?: string } = {},
): Promise<TestUser> {
  const email = uniqueEmail(options.prefix ?? 'user');
  const password = `senha-${randomUUID()}`;
  const totpSecret = options.withTotp ? generateTotpSecret() : null;
  const box = new SecretBox(env('APP_ENCRYPTION_KEY'));
  const { rows } = await testPools().platform.query<{ id: string }>(
    `INSERT INTO app_user (email, password_hash, totp_secret_enc, totp_enabled_at, is_platform_admin)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [
      email,
      await hash(password, { memoryCost: 19_456, timeCost: 2, parallelism: 1 }),
      totpSecret ? box.encrypt(totpSecret) : null,
      totpSecret ? new Date() : null,
      options.platformAdmin ?? false,
    ],
  );
  return { id: rows[0]?.id ?? '', email, password, totpSecret };
}

export async function assignRole(
  userId: string,
  gestoraId: string,
  roleKey: string,
  options: { condominioId?: string; validFrom?: Date; validUntil?: Date } = {},
): Promise<string> {
  const scope = options.condominioId
    ? condominioScope(gestoraId, options.condominioId)
    : gestoraScope(gestoraId);
  const { rows } = await testPools().platform.query<{ id: string }>(
    `INSERT INTO role_assignment (gestora_id, user_id, role_id, scope_path, requires_mfa, valid_from, valid_until)
     SELECT $1, $2, r.id, $3::ltree, r.requires_mfa, coalesce($5, now()), $6
       FROM role r WHERE r.gestora_id IS NULL AND r.key = $4
     RETURNING id`,
    [gestoraId, userId, scope, roleKey, options.validFrom ?? null, options.validUntil ?? null],
  );
  if (!rows[0]) throw new Error(`Papel ${roleKey} não encontrado`);
  return rows[0].id;
}

export async function createCondominio(
  gestoraId: string,
  nome = `Condomínio ${randomUUID().slice(0, 6)}`,
): Promise<string> {
  return withContext(testPools().app, { gestoraId }, async (c) => {
    const { rows } = await c.query<{ id: string }>(
      'INSERT INTO condominio (gestora_id, nome, cnpj) VALUES ($1, $2, $3) RETURNING id',
      [gestoraId, nome, randomCnpj()],
    );
    return rows[0]?.id ?? '';
  });
}

export async function countAudit(
  where: { action?: string; gestoraId?: string | null } = {},
): Promise<number> {
  const { rows } = await testPools().admin.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM audit_log
      WHERE ($1::text IS NULL OR action = $1)
        AND ($2::text IS NULL OR chain = $2)`,
    [where.action ?? null, where.gestoraId === undefined ? null : (where.gestoraId ?? 'platform')],
  );
  return rows[0]?.n ?? 0;
}
