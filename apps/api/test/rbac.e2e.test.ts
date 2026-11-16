import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, login, type TestApp } from './support/app';
import {
  assignRole,
  closeTestPools,
  createCondominio,
  createGestora,
  createUser,
  randomCnpj,
  testPools,
  uniqueEmail,
  type TestUser,
} from './support/db';

let t: TestApp;
let gestoraA: string;
let gestoraB: string;
let condoA1: string;
let condoA2: string;
let condoB1: string;
let admin: TestUser;
let adminToken: string;

const auth = (token: string, gestoraId?: string) => ({
  Authorization: `Bearer ${token}`,
  ...(gestoraId ? { 'x-gestora-id': gestoraId } : {}),
});

async function systemRoleId(key: string): Promise<string> {
  const { rows } = await testPools().admin.query<{ id: string }>(
    'SELECT id FROM role WHERE gestora_id IS NULL AND key = $1',
    [key],
  );
  return rows[0]?.id ?? '';
}

beforeAll(async () => {
  t = await createTestApp();
  gestoraA = await createGestora('Gestora A');
  gestoraB = await createGestora('Gestora B');
  condoB1 = await createCondominio(gestoraB, 'B1');
  admin = await createUser({ withTotp: true, prefix: 'admin-a' });
  await assignRole(admin.id, gestoraA, 'gestora_admin');
  adminToken = await login(t, admin);

  const created = await t
    .http()
    .post('/condominios')
    .set(auth(adminToken, gestoraA))
    .send({ nome: 'Residencial A1', cnpj: randomCnpj() });
  expect(created.status).toBe(201);
  condoA1 = created.body.id;
  condoA2 = await createCondominio(gestoraA, 'Residencial A2');
});

afterAll(async () => {
  await t.close();
  await closeTestPools();
});

describe('gestora', () => {
  it('vê todos os condomínios da gestora e nenhum de outra', async () => {
    const res = await t.http().get('/condominios').set(auth(adminToken, gestoraA));
    expect(res.status).toBe(200);
    expect(res.body.map((c: { id: string }) => c.id).sort()).toEqual([condoA1, condoA2].sort());
  });

  it('não acessa outra gestora trocando o header', async () => {
    expect((await t.http().get('/condominios').set(auth(adminToken, gestoraB))).status).toBe(403);
    expect(
      (await t.http().get(`/condominios/${condoB1}`).set(auth(adminToken, gestoraB))).status,
    ).toBe(403);
  });

  it('condomínio de outra gestora pelo id: 404, sem revelar que existe', async () => {
    const res = await t.http().get(`/condominios/${condoB1}`).set(auth(adminToken, gestoraA));
    expect(res.status).toBe(404);
  });

  it('sem x-gestora-id: 400', async () => {
    expect((await t.http().get('/condominios').set(auth(adminToken))).status).toBe(400);
  });

  it('CNPJ inválido: 400', async () => {
    const res = await t
      .http()
      .post('/condominios')
      .set(auth(adminToken, gestoraA))
      .send({ nome: 'X', cnpj: '11111111111111' });
    expect(res.status).toBe(400);
  });
});

describe('síndico com escopo de condomínio', () => {
  let sindico: TestUser;
  let sindicoToken: string;

  beforeAll(async () => {
    sindico = await createUser({ withTotp: true, prefix: 'sindico' });
    const res = await t
      .http()
      .post('/role-assignments')
      .set(auth(adminToken, gestoraA))
      .send({
        userId: sindico.id,
        roleId: await systemRoleId('sindico'),
        scope: { type: 'condominio', condominioId: condoA1 },
      });
    expect(res.status).toBe(201);
    sindicoToken = await login(t, sindico);
  });

  it('lista só o condomínio onde é síndico', async () => {
    const res = await t.http().get('/condominios').set(auth(sindicoToken, gestoraA));
    expect(res.body.map((c: { id: string }) => c.id)).toEqual([condoA1]);
  });

  it('lê o próprio condomínio e não lê outro da mesma gestora', async () => {
    expect(
      (await t.http().get(`/condominios/${condoA1}`).set(auth(sindicoToken, gestoraA))).status,
    ).toBe(200);
    expect(
      (await t.http().get(`/condominios/${condoA2}`).set(auth(sindicoToken, gestoraA))).status,
    ).toBe(403);
  });

  it('não cria condomínio nem papéis', async () => {
    expect(
      (
        await t
          .http()
          .post('/condominios')
          .set(auth(sindicoToken, gestoraA))
          .send({ nome: 'X', cnpj: randomCnpj() })
      ).status,
    ).toBe(403);
    expect(
      (
        await t
          .http()
          .post('/roles')
          .set(auth(sindicoToken, gestoraA))
          .send({ key: 'x', name: 'X', requiresMfa: false, permissions: ['condominio:read'] })
      ).status,
    ).toBe(403);
  });

  it('/me mostra o papel e o escopo', async () => {
    const res = await t.http().get('/me').set(auth(sindicoToken));
    expect(res.body.gestoras).toEqual([
      {
        id: gestoraA,
        nome: 'Gestora A',
        branding: {},
        roles: [
          { key: 'sindico', name: 'Síndico', scope: { type: 'condominio', condominioId: condoA1 } },
        ],
      },
    ]);
  });
});

describe('papel que exige 2FA com sessão sem 2FA', () => {
  it('morador promovido a síndico precisa refazer o login com 2FA', async () => {
    const morador = await createUser({ prefix: 'morador' });
    await assignRole(morador.id, gestoraA, 'morador');
    const token = await login(t, morador); // sessão sem 2FA
    await assignRole(morador.id, gestoraA, 'sindico', { condominioId: condoA1 });

    const res = await t.http().get(`/condominios/${condoA1}`).set(auth(token, gestoraA));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('mfa_required');
  });
});

describe('validade da atribuição', () => {
  it('atribuição expirada não dá acesso', async () => {
    const user = await createUser({ prefix: 'expirado' });
    await assignRole(user.id, gestoraA, 'morador');
    const token = await login(t, user);
    // Papel customizado sem 2FA, atribuído já expirado.
    const role = await t
      .http()
      .post('/roles')
      .set(auth(adminToken, gestoraA))
      .send({
        key: 'leitor_expirado',
        name: 'Leitor',
        requiresMfa: false,
        permissions: ['condominio:read'],
      });
    expect(role.status).toBe(201);
    await testPools().platform.query(
      `INSERT INTO role_assignment (gestora_id, user_id, role_id, scope_path, requires_mfa, valid_from, valid_until)
       VALUES ($1, $2, $3, text2ltree(app_scope_label('g', $1::uuid)), false, now() - interval '2 days', now() - interval '1 day')`,
      [gestoraA, user.id, role.body.id],
    );
    expect((await t.http().get(`/condominios/${condoA1}`).set(auth(token, gestoraA))).status).toBe(
      403,
    );
  });
});

describe('papéis customizados e anti-escalada', () => {
  let delegado: TestUser;
  let delegadoToken: string;
  let customRoleId: string;

  beforeAll(async () => {
    const role = await t
      .http()
      .post('/roles')
      .set(auth(adminToken, gestoraA))
      .send({
        key: 'assistente',
        name: 'Assistente',
        requiresMfa: false,
        permissions: ['condominio:read', 'role:manage'],
      });
    expect(role.status).toBe(201);
    expect(role.body).toMatchObject({
      system: false,
      permissions: expect.arrayContaining(['condominio:read', 'role:manage']),
    });
    customRoleId = role.body.id;

    delegado = await createUser({ prefix: 'assistente' });
    const assigned = await t
      .http()
      .post('/role-assignments')
      .set(auth(adminToken, gestoraA))
      .send({
        userId: delegado.id,
        roleId: customRoleId,
        scope: { type: 'condominio', condominioId: condoA1 },
      });
    expect(assigned.status).toBe(201);
    delegadoToken = await login(t, delegado);
  });

  it('a chave do papel é única na gestora', async () => {
    const dup = await t
      .http()
      .post('/roles')
      .set(auth(adminToken, gestoraA))
      .send({
        key: 'assistente',
        name: 'Outro',
        requiresMfa: false,
        permissions: ['condominio:read'],
      });
    expect(dup.status).toBe(409);
  });

  it('outra gestora não vê o papel customizado', async () => {
    const adminB = await createUser({ withTotp: true, prefix: 'admin-b' });
    await assignRole(adminB.id, gestoraB, 'gestora_admin');
    const tokenB = await login(t, adminB);
    const res = await t.http().get('/roles').set(auth(tokenB, gestoraB));
    expect(res.body.map((r: { id: string }) => r.id)).not.toContain(customRoleId);
  });

  it('pode delegar no próprio escopo um papel que não excede suas permissões', async () => {
    const target = await createUser();
    const res = await t
      .http()
      .post('/role-assignments')
      .set(auth(delegadoToken, gestoraA))
      .send({
        userId: target.id,
        roleId: customRoleId,
        scope: { type: 'condominio', condominioId: condoA1 },
      });
    expect(res.status).toBe(201);
  });

  it('não delega fora do próprio escopo', async () => {
    const target = await createUser();
    const res = await t
      .http()
      .post('/role-assignments')
      .set(auth(delegadoToken, gestoraA))
      .send({
        userId: target.id,
        roleId: customRoleId,
        scope: { type: 'condominio', condominioId: condoA2 },
      });
    expect(res.status).toBe(403);
  });

  it('não delega papel com permissões que não tem (escalada)', async () => {
    const target = await createUser();
    const res = await t
      .http()
      .post('/role-assignments')
      .set(auth(delegadoToken, gestoraA))
      .send({
        userId: target.id,
        roleId: await systemRoleId('gestora_admin'),
        scope: { type: 'condominio', condominioId: condoA1 },
      });
    expect(res.status).toBe(403);
  });

  it('gestora nomeia síndico (que aprova pagamentos), mas não pode nomear a si mesma', async () => {
    const self = await t
      .http()
      .post('/role-assignments')
      .set(auth(adminToken, gestoraA))
      .send({
        userId: admin.id,
        roleId: await systemRoleId('sindico'),
        scope: { type: 'condominio', condominioId: condoA1 },
      });
    expect(self.status).toBe(403);
    expect(self.body.message).toMatch(/si mesmo/);
  });

  it('gestora convida síndico por e-mail: cria o login, atribui no condomínio e envia o link', async () => {
    const email = uniqueEmail('sindico-convidado');
    const res = await t
      .http()
      .post(`/condominios/${condoA1}/staff-invites`)
      .set(auth(adminToken, gestoraA))
      .send({ nome: 'Síndica Convidada', email, papel: 'sindico' });
    expect(res.status).toBe(201);
    expect(res.body.scope).toEqual({ type: 'condominio', condominioId: condoA1 });

    const consumed = await t
      .http()
      .post('/auth/magic-link/consume')
      .send({ token: t.mailer.lastTokenFor(email) });
    expect(consumed.body.status).toBe('mfa_enrollment_required');

    const self = await t
      .http()
      .post(`/condominios/${condoA1}/staff-invites`)
      .set(auth(adminToken, gestoraA))
      .send({ nome: 'Eu', email: admin.email, papel: 'conselheiro' });
    expect(self.status).toBe(403);
  });

  it('não atribui escopo em condomínio de outra gestora', async () => {
    const target = await createUser();
    const res = await t
      .http()
      .post('/role-assignments')
      .set(auth(adminToken, gestoraA))
      .send({
        userId: target.id,
        roleId: customRoleId,
        scope: { type: 'condominio', condominioId: condoB1 },
      });
    expect(res.status).toBe(404);
  });
});
