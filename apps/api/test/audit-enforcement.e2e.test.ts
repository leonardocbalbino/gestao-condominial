import { Controller, Module, Post } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { currentContext } from '../src/db/request-context';
import { appUser } from '../src/db/schema';
import { Public } from '../src/http/access';
import { createTestApp, login, type TestApp } from './support/app';
import {
  assignRole,
  closeTestPools,
  countAudit,
  createGestora,
  createUser,
  randomCnpj,
  testPools,
  uniqueEmail,
} from './support/db';

const UNAUDITED_EMAIL = uniqueEmail('nao-auditado');

/** Endpoint de teste que muda dados e "esquece" de auditar. */
@Controller('test-only')
class UnauditedController {
  @Post('unaudited')
  @Public()
  async mutate(): Promise<void> {
    await currentContext().tx.insert(appUser).values({ email: UNAUDITED_EMAIL });
  }
}

@Module({ controllers: [UnauditedController] })
class UnauditedModule {}

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp([UnauditedModule]);
});

afterAll(async () => {
  await t.close();
  await closeTestPools();
});

describe('toda mutação gera auditoria', () => {
  it('mutação sem auditoria é recusada e desfeita', async () => {
    const res = await t.http().post('/test-only/unaudited');
    expect(res.status).toBe(500);
    const { rows } = await testPools().admin.query('SELECT 1 FROM app_user WHERE email = $1', [
      UNAUDITED_EMAIL,
    ]);
    expect(rows).toHaveLength(0);
  });

  it('cada endpoint de mutação grava auditoria com ator, recurso e IP', async () => {
    const gestoraId = await createGestora();
    const admin = await createUser({ withTotp: true });
    await assignRole(admin.id, gestoraId, 'gestora_admin');
    const loginsBefore = await countAudit({ action: 'auth.login' });
    const token = await login(t, admin);
    expect(await countAudit({ action: 'auth.login' })).toBe(loginsBefore + 1);

    const headers = { Authorization: `Bearer ${token}`, 'x-gestora-id': gestoraId };
    const cases: {
      action: string;
      call: () => Promise<{ status: number; body: { id?: string } }>;
    }[] = [
      {
        action: 'condominio.created',
        call: () =>
          t.http().post('/condominios').set(headers).send({ nome: 'Auditado', cnpj: randomCnpj() }),
      },
      {
        action: 'role.created',
        call: () =>
          t
            .http()
            .post('/roles')
            .set(headers)
            .send({
              key: 'zelador',
              name: 'Zelador',
              requiresMfa: false,
              permissions: ['condominio:read'],
            }),
      },
    ];

    for (const c of cases) {
      const before = await countAudit({ action: c.action, gestoraId });
      const res = await c.call();
      expect(res.status, c.action).toBe(201);
      expect(await countAudit({ action: c.action, gestoraId }), c.action).toBe(before + 1);

      const { rows } = await testPools().admin.query(
        'SELECT actor_user_id, resource_id, host(ip) AS ip, after FROM audit_log WHERE chain = $1 AND action = $2 ORDER BY seq DESC LIMIT 1',
        [gestoraId, c.action],
      );
      expect(rows[0]).toMatchObject({
        actor_user_id: admin.id,
        resource_id: res.body.id,
        ip: expect.any(String),
      });
      expect(rows[0].after).toMatchObject({ id: res.body.id });
    }
  });

  it('auditoria não vaza segredos (senha, hash, segredo TOTP)', async () => {
    const { rows } = await testPools().admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM audit_log
        WHERE coalesce(after::text, '') ~* '(password|totp_secret|argon2)'
           OR coalesce(before::text, '') ~* '(password|totp_secret|argon2)'`,
    );
    expect(rows[0]?.n).toBe(0);
  });
});
