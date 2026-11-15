import type { PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { closeTestPools, createGestora, testPools, withContext } from './support/db';

interface Verification {
  ok: boolean;
  checked: string;
  broken_seq: string | null;
  reason: string | null;
}

const insertAudit = (c: PoolClient, gestoraId: string, action: string, after: unknown = null) =>
  c.query(
    `INSERT INTO audit_log (gestora_id, action, resource_type, resource_id, after, ip)
     VALUES ($1, $2, 'teste', 'r1', $3, '203.0.113.7')`,
    [gestoraId, action, after === null ? null : JSON.stringify(after)],
  );

const verify = (gestoraId: string): Promise<Verification> =>
  withContext(testPools().app, { gestoraId }, async (c) => {
    const { rows } = await c.query<Verification>('SELECT * FROM audit_verify_chain($1)', [
      gestoraId,
    ]);
    if (!rows[0]) throw new Error('sem resultado');
    return rows[0];
  });

/** Adultera como superusuário (simula acesso direto ao banco), desligando os triggers de proteção. */
async function tamper(sqlText: string, params: unknown[]): Promise<void> {
  const client = await testPools().admin.connect();
  try {
    await client.query('BEGIN');
    await client.query('ALTER TABLE audit_log DISABLE TRIGGER audit_log_no_update_delete');
    await client.query(sqlText, params);
    await client.query('ALTER TABLE audit_log ENABLE TRIGGER audit_log_no_update_delete');
    await client.query('COMMIT');
  } finally {
    client.release();
  }
}

afterAll(closeTestPools);

describe('audit_log encadeado por hash', () => {
  let gestoraId: string;

  beforeAll(async () => {
    gestoraId = await createGestora();
    await withContext(testPools().app, { gestoraId }, async (c) => {
      for (let i = 1; i <= 5; i++) await insertAudit(c, gestoraId, `acao.${i}`, { n: i });
    });
  });

  it('cada linha guarda o hash da anterior, com sequência contínua', async () => {
    const { rows } = await testPools().admin.query<{
      seq: string;
      prev_hash: string;
      hash: string;
    }>('SELECT seq, prev_hash, hash FROM audit_log WHERE chain = $1 ORDER BY seq', [gestoraId]);
    expect(rows.map((r) => Number(r.seq))).toEqual([1, 2, 3, 4, 5]);
    expect(rows[0]?.prev_hash).toBe('0'.repeat(64));
    for (let i = 1; i < rows.length; i++) expect(rows[i]?.prev_hash).toBe(rows[i - 1]?.hash);
  });

  it('a cadeia íntegra é verificada com sucesso', async () => {
    expect(await verify(gestoraId)).toMatchObject({ ok: true, checked: '5' });
  });

  it('valores enviados para seq/hash são ignorados (o trigger decide)', async () => {
    await withContext(testPools().app, { gestoraId }, (c) =>
      c.query(
        `INSERT INTO audit_log (gestora_id, action, resource_type, chain, seq, prev_hash, hash)
         VALUES ($1, 'forjado', 'teste', 'outra', 999, $2, $2)`,
        [gestoraId, 'f'.repeat(64)],
      ),
    );
    const { rows } = await testPools().admin.query(
      "SELECT chain, seq FROM audit_log WHERE action = 'forjado'",
    );
    expect(rows[0]).toMatchObject({ chain: gestoraId, seq: '6' });
    expect((await verify(gestoraId)).ok).toBe(true);
  });

  it.each([
    ['UPDATE', "UPDATE audit_log SET action = 'x' WHERE chain = $1"],
    ['DELETE', 'DELETE FROM audit_log WHERE chain = $1'],
  ])('%s é bloqueado mesmo para o dono do schema', async (_op, sqlText) => {
    await expect(testPools().admin.query(sqlText, [gestoraId])).rejects.toThrow(/append-only/);
  });

  it('TRUNCATE é bloqueado', async () => {
    await expect(testPools().admin.query('TRUNCATE audit_log')).rejects.toThrow(/append-only/);
  });

  describe('detecção de adulteração', () => {
    it('detecta conteúdo alterado', async () => {
      const g = await createGestora();
      await withContext(testPools().app, { gestoraId: g }, async (c) => {
        for (let i = 1; i <= 3; i++) await insertAudit(c, g, `a.${i}`, { valor: i * 100 });
      });
      await tamper(`UPDATE audit_log SET after = '{"valor": 1}' WHERE chain = $1 AND seq = 2`, [g]);
      expect(await verify(g)).toMatchObject({
        ok: false,
        broken_seq: '2',
        reason: 'conteúdo alterado',
      });
    });

    it('detecta linha removida no meio', async () => {
      const g = await createGestora();
      await withContext(testPools().app, { gestoraId: g }, async (c) => {
        for (let i = 1; i <= 3; i++) await insertAudit(c, g, `a.${i}`);
      });
      await tamper('DELETE FROM audit_log WHERE chain = $1 AND seq = 2', [g]);
      expect(await verify(g)).toMatchObject({
        ok: false,
        broken_seq: '3',
        reason: 'sequência com lacuna',
      });
    });

    it('detecta linhas removidas do final', async () => {
      const g = await createGestora();
      await withContext(testPools().app, { gestoraId: g }, async (c) => {
        for (let i = 1; i <= 3; i++) await insertAudit(c, g, `a.${i}`);
      });
      await tamper('DELETE FROM audit_log WHERE chain = $1 AND seq = 3', [g]);
      expect(await verify(g)).toMatchObject({ ok: false, reason: 'final da cadeia removido' });
    });
  });

  it('gestora não consulta a ponta da cadeia de outra gestora', async () => {
    const other = await createGestora();
    await expect(
      withContext(testPools().app, { gestoraId }, (c) =>
        c.query('SELECT * FROM audit_chain_tip($1)', [other]),
      ),
    ).rejects.toThrow(/sem acesso/);
  });

  it('inserções concorrentes na mesma cadeia continuam encadeadas', async () => {
    const g = await createGestora();
    await Promise.all(
      Array.from({ length: 4 }, (_, worker) =>
        withContext(testPools().app, { gestoraId: g }, async (c) => {
          for (let i = 0; i < 10; i++) await insertAudit(c, g, `w${worker}.${i}`);
        }),
      ),
    );
    expect(await verify(g)).toMatchObject({ ok: true, checked: '40' });
  });

  it('transação desfeita não deixa lacuna na sequência', async () => {
    const g = await createGestora();
    await withContext(testPools().app, { gestoraId: g }, (c) => insertAudit(c, g, 'a.1'));
    await expect(
      withContext(testPools().app, { gestoraId: g }, async (c) => {
        await insertAudit(c, g, 'desfeita');
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    await withContext(testPools().app, { gestoraId: g }, (c) => insertAudit(c, g, 'a.2'));
    expect(await verify(g)).toMatchObject({ ok: true, checked: '2' });
  });
});
