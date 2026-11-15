import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  assignRole,
  closeTestPools,
  createCondominio,
  createGestora,
  createUser,
  randomCnpj,
  testPools,
  withContext,
} from './support/db';

/**
 * Aceite da Fase 0: a gestora A não lê nem altera dados da gestora B, e uma consulta
 * sem contexto retorna zero linhas. Testado direto no banco, com o mesmo papel da API.
 */
describe('isolamento de tenant (RLS)', () => {
  let gestoraA: string;
  let gestoraB: string;
  let condoA: string;
  let condoB: string;
  let userA: string;
  let userB: string;

  beforeAll(async () => {
    gestoraA = await createGestora('Gestora A');
    gestoraB = await createGestora('Gestora B');
    condoA = await createCondominio(gestoraA, 'Residencial A');
    condoB = await createCondominio(gestoraB, 'Residencial B');
    userA = (await createUser()).id;
    userB = (await createUser()).id;
    await assignRole(userA, gestoraA, 'gestora_admin');
    await assignRole(userB, gestoraB, 'gestora_admin');
    for (const [gestoraId, userId] of [
      [gestoraA, userA],
      [gestoraB, userB],
    ] as const) {
      await withContext(testPools().app, { gestoraId }, (c) =>
        c.query('INSERT INTO person (gestora_id, user_id, nome) VALUES ($1, $2, $3)', [
          gestoraId,
          userId,
          'Pessoa',
        ]),
      );
      await withContext(testPools().app, { gestoraId }, (c) =>
        c.query(
          "INSERT INTO audit_log (gestora_id, action, resource_type) VALUES ($1, 'teste', 'teste')",
          [gestoraId],
        ),
      );
    }
  });

  afterAll(closeTestPools);

  const tenantTables = ['condominio', 'person', 'role_assignment', 'audit_log'];

  it.each(tenantTables)('sem contexto, %s retorna zero linhas', async (table) => {
    const { rows } = await withContext(testPools().app, {}, (c) =>
      c.query(`SELECT count(*)::int AS n FROM ${table}`),
    );
    expect(rows[0].n).toBe(0);
  });

  it('sem contexto, gestora retorna zero linhas', async () => {
    const { rows } = await withContext(testPools().app, {}, (c) =>
      c.query('SELECT count(*)::int AS n FROM gestora'),
    );
    expect(rows[0].n).toBe(0);
  });

  it.each(tenantTables)('gestora A só enxerga as próprias linhas em %s', async (table) => {
    const { rows } = await withContext(testPools().app, { gestoraId: gestoraA }, (c) =>
      c.query<{ gestora_id: string }>(`SELECT DISTINCT gestora_id FROM ${table}`),
    );
    expect(rows.map((r) => r.gestora_id)).toEqual([gestoraA]);
  });

  it('gestora A não lê um condomínio de B nem pelo id', async () => {
    const { rows } = await withContext(testPools().app, { gestoraId: gestoraA }, (c) =>
      c.query('SELECT id FROM condominio WHERE id = $1', [condoB]),
    );
    expect(rows).toHaveLength(0);
  });

  it('gestora A não altera condomínio de B (UPDATE afeta zero linhas)', async () => {
    const result = await withContext(testPools().app, { gestoraId: gestoraA }, (c) =>
      c.query("UPDATE condominio SET nome = 'invadido' WHERE id = $1", [condoB]),
    );
    expect(result.rowCount).toBe(0);
    const { rows } = await withContext(testPools().app, { gestoraId: gestoraB }, (c) =>
      c.query<{ nome: string }>('SELECT nome FROM condominio WHERE id = $1', [condoB]),
    );
    expect(rows[0]?.nome).toBe('Residencial B');
  });

  it('gestora A não insere dados em nome de B', async () => {
    await expect(
      withContext(testPools().app, { gestoraId: gestoraA }, (c) =>
        c.query("INSERT INTO condominio (gestora_id, nome, cnpj) VALUES ($1, 'Intruso', $2)", [
          gestoraB,
          randomCnpj(),
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('gestora A não move um condomínio próprio para B', async () => {
    await expect(
      withContext(testPools().app, { gestoraId: gestoraA }, (c) =>
        c.query('UPDATE condominio SET gestora_id = $1 WHERE id = $2', [gestoraB, condoA]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('gestora A não grava auditoria na cadeia de B', async () => {
    await expect(
      withContext(testPools().app, { gestoraId: gestoraA }, (c) =>
        c.query("INSERT INTO audit_log (gestora_id, action, resource_type) VALUES ($1, 'x', 'x')", [
          gestoraB,
        ]),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it('usuário vê as próprias atribuições em outras gestoras, mas não as de terceiros', async () => {
    const { rows } = await withContext(
      testPools().app,
      { gestoraId: gestoraA, userId: userB },
      (c) =>
        c.query<{ user_id: string; gestora_id: string }>(
          'SELECT user_id, gestora_id FROM role_assignment',
        ),
    );
    // Da gestora A (em contexto) vê todas; de B, só as do próprio userB.
    expect(rows.filter((r) => r.gestora_id === gestoraB).every((r) => r.user_id === userB)).toBe(
      true,
    );
    expect(rows.some((r) => r.gestora_id === gestoraA)).toBe(true);
  });

  it('a API não consegue apagar nada (sem privilégio de DELETE)', async () => {
    await expect(
      withContext(testPools().app, { gestoraId: gestoraA }, (c) =>
        c.query('DELETE FROM condominio WHERE id = $1', [condoA]),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('o contexto é por transação: não vaza para a próxima transação da mesma conexão', async () => {
    const client = await testPools().app.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT set_config('app.gestora_id', $1, true)", [gestoraA]);
      await client.query('COMMIT');
      const { rows } = await client.query('SELECT count(*)::int AS n FROM condominio');
      expect(rows[0].n).toBe(0);
    } finally {
      client.release();
    }
  });
});

describe('caminho de plataforma (app_platform)', () => {
  afterAll(closeTestPools);

  it('enxerga todas as gestoras sem BYPASSRLS', async () => {
    const { rows } = await testPools().platform.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM gestora',
    );
    expect(rows[0]?.n).toBeGreaterThanOrEqual(2);
  });

  it('não cria condomínios (só leitura)', async () => {
    const gestoraId = await createGestora();
    await expect(
      testPools().platform.query(
        "INSERT INTO condominio (gestora_id, nome, cnpj) VALUES ($1, 'x', $2)",
        [gestoraId, randomCnpj()],
      ),
    ).rejects.toThrow(/permission denied/);
  });
});
