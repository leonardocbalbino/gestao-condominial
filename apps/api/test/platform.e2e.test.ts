import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, login, nextTotp, type TestApp } from './support/app';
import {
  assignRole,
  closeTestPools,
  createGestora,
  createUser,
  randomCnpj,
  testPools,
  uniqueEmail,
  type TestUser,
} from './support/db';

let t: TestApp;
let superAdmin: TestUser;
let superToken: string;

beforeAll(async () => {
  t = await createTestApp();
  superAdmin = await createUser({ withTotp: true, platformAdmin: true, prefix: 'super' });
  superToken = await login(t, superAdmin);
});

afterAll(async () => {
  await t.close();
  await closeTestPools();
});

const asSuper = () => ({ Authorization: `Bearer ${superToken}` });

describe('super admin da plataforma', () => {
  it('super admin sempre passa por 2FA', async () => {
    const res = await t
      .http()
      .post('/auth/login')
      .send({ email: superAdmin.email, password: superAdmin.password });
    expect(res.body.status).toBe('mfa_required');
  });

  it('cria gestora, admin e convite; o admin entra pelo link e configura o 2FA', async () => {
    const adminEmail = uniqueEmail('nova-admin');
    const created = await t
      .http()
      .post('/platform/gestoras')
      .set(asSuper())
      .send({
        nome: 'Gestora Nova',
        cnpj: randomCnpj(),
        branding: { primaryColor: '#7B1FA2' },
        admin: { nome: 'Ana Admin', email: adminEmail },
      });
    expect(created.status).toBe(201);
    const gestoraId = created.body.id as string;

    const list = await t.http().get('/platform/gestoras').set(asSuper());
    expect(list.body.map((g: { id: string }) => g.id)).toContain(gestoraId);

    // Convite chega por e-mail; admin da gestora exige 2FA, então o link leva à configuração.
    const token = t.mailer.lastTokenFor(adminEmail);
    const consumed = await t.http().post('/auth/magic-link/consume').send({ token });
    expect(consumed.body.status).toBe('mfa_enrollment_required');
    const enroll = await t
      .http()
      .post('/auth/mfa/enroll')
      .send({ mfaToken: consumed.body.mfaToken });
    const verified = await t
      .http()
      .post('/auth/mfa/verify')
      .send({ mfaToken: consumed.body.mfaToken, code: nextTotp(enroll.body.secret) });
    expect(verified.body.status).toBe('authenticated');
    const adminToken = verified.body.accessToken as string;

    const me = await t.http().get('/me').set('Authorization', `Bearer ${adminToken}`);
    expect(me.body.gestoras).toEqual([
      {
        id: gestoraId,
        nome: 'Gestora Nova',
        roles: [expect.objectContaining({ key: 'gestora_admin' })],
      },
    ]);

    // A trilha da nova gestora começa com a criação feita pela plataforma, e está íntegra.
    const verify = await t
      .http()
      .get('/audit/verify')
      .set({ Authorization: `Bearer ${adminToken}`, 'x-gestora-id': gestoraId });
    expect(verify.body).toMatchObject({ ok: true });
    const { rows } = await testPools().admin.query(
      'SELECT action, actor_user_id FROM audit_log WHERE chain = $1 AND seq = 1',
      [gestoraId],
    );
    expect(rows[0]).toEqual({ action: 'platform.gestora.created', actor_user_id: superAdmin.id });
  });

  it('CNPJ duplicado: 409', async () => {
    const cnpj = randomCnpj();
    const body = (email: string) => ({ nome: 'G', cnpj, admin: { nome: 'A', email } });
    expect(
      (
        await t
          .http()
          .post('/platform/gestoras')
          .set(asSuper())
          .send(body(uniqueEmail('a')))
      ).status,
    ).toBe(201);
    expect(
      (
        await t
          .http()
          .post('/platform/gestoras')
          .set(asSuper())
          .send(body(uniqueEmail('b')))
      ).status,
    ).toBe(409);
  });

  it('admin de gestora (mesmo com 2FA) não acessa /platform', async () => {
    const gestoraId = await createGestora();
    const admin = await createUser({ withTotp: true });
    await assignRole(admin.id, gestoraId, 'gestora_admin');
    const token = await login(t, admin);
    expect(
      (await t.http().get('/platform/gestoras').set('Authorization', `Bearer ${token}`)).status,
    ).toBe(403);
  });

  it('super admin rebaixado perde o acesso mesmo com token ainda válido', async () => {
    const other = await createUser({ withTotp: true, platformAdmin: true });
    const token = await login(t, other);
    expect(
      (await t.http().get('/platform/gestoras').set('Authorization', `Bearer ${token}`)).status,
    ).toBe(200);
    await testPools().platform.query(
      'UPDATE app_user SET is_platform_admin = false WHERE id = $1',
      [other.id],
    );
    expect(
      (await t.http().get('/platform/gestoras').set('Authorization', `Bearer ${token}`)).status,
    ).toBe(403);
  });
});
