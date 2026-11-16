import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, login, type TestApp } from './support/app';
import {
  assignRole,
  closeTestPools,
  countAudit,
  createCondominio,
  createGestora,
  createUser,
  testPools,
  uniqueEmail,
  type TestUser,
} from './support/db';

let t: TestApp;
let gestoraA: string;
let gestoraB: string;
let condoA: string;
let condoB: string;
let adminToken: string;
let adminBToken: string;

const auth = (token: string, gestoraId: string) => ({
  Authorization: `Bearer ${token}`,
  'x-gestora-id': gestoraId,
});

beforeAll(async () => {
  t = await createTestApp();
  gestoraA = await createGestora();
  gestoraB = await createGestora();
  condoA = await createCondominio(gestoraA);
  condoB = await createCondominio(gestoraB);
  const admin = await createUser({ withTotp: true, prefix: 'admin' });
  await assignRole(admin.id, gestoraA, 'gestora_admin');
  adminToken = await login(t, admin);
  const adminB = await createUser({ withTotp: true, prefix: 'admin-b' });
  await assignRole(adminB.id, gestoraB, 'gestora_admin');
  adminBToken = await login(t, adminB);
});

afterAll(async () => {
  await t.close();
  await closeTestPools();
});

describe('blocos e unidades', () => {
  it('gera "Torre A, 3 andares, 4 por andar" com numeração 101…304', async () => {
    const res = await t
      .http()
      .post(`/condominios/${condoA}/blocks/generate`)
      .set(auth(adminToken, gestoraA))
      .send({ nome: 'Torre A', andares: 3, unidadesPorAndar: 4, fracaoIdeal: '0,0833333333' });
    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(12);
    expect(res.body.map((u: { numero: string }) => u.numero)).toEqual([
      '101',
      '102',
      '103',
      '104',
      '201',
      '202',
      '203',
      '204',
      '301',
      '302',
      '303',
      '304',
    ]);
    expect(res.body[0]).toMatchObject({
      blockNome: 'Torre A',
      andar: 1,
      fracaoIdeal: '0.0833333333',
    });

    const again = await t
      .http()
      .post(`/condominios/${condoA}/blocks/generate`)
      .set(auth(adminToken, gestoraA))
      .send({ nome: 'Torre A', andares: 1, unidadesPorAndar: 1 });
    expect(again.status).toBe(409);
  });

  it('importa CSV com ; criando blocos que faltam; linhas inválidas voltam todas juntas', async () => {
    const invalid = await t
      .http()
      .post(`/condominios/${condoA}/units/import`)
      .set(auth(adminToken, gestoraA))
      .send({
        csv: 'bloco;andar;numero;tipo;fracao_ideal\nBloco 2;1;;apartamento;\nBloco 2;1;12;nave;',
      });
    expect(invalid.status).toBe(400);
    expect(invalid.body.issues.map((i: { linha: number }) => i.linha)).toEqual([2, 3]);

    const ok = await t
      .http()
      .post(`/condominios/${condoA}/units/import`)
      .set(auth(adminToken, gestoraA))
      .send({
        csv: '\uFEFFBloco;Andar;Número;Tipo;Fração Ideal\r\nBloco 2;1;11;apartamento;0,02\r\nBloco 2;1;12;;\r\n;;Loja 1;loja;0,01\r\n',
      });
    expect(ok.status).toBe(201);
    expect(ok.body).toEqual({ blocosCriados: 1, unidadesCriadas: 3 });

    const units = await t
      .http()
      .get(`/condominios/${condoA}/units`)
      .set(auth(adminToken, gestoraA));
    expect(units.body).toHaveLength(15);
    expect(units.body.find((u: { numero: string }) => u.numero === 'Loja 1')).toMatchObject({
      blockId: null,
      tipo: 'loja',
    });
  });

  it('importação é tudo ou nada: número repetido não grava nenhuma linha', async () => {
    const before = await t
      .http()
      .get(`/condominios/${condoA}/units`)
      .set(auth(adminToken, gestoraA));
    const res = await t
      .http()
      .post(`/condominios/${condoA}/units/import`)
      .set(auth(adminToken, gestoraA))
      .send({ csv: 'bloco;numero\nBloco 3;1\nBloco 3;1' });
    expect(res.status).toBe(409);
    const after = await t
      .http()
      .get(`/condominios/${condoA}/units`)
      .set(auth(adminToken, gestoraA));
    expect(after.body).toHaveLength(before.body.length);
    const blocks = await t
      .http()
      .get(`/condominios/${condoA}/blocks`)
      .set(auth(adminToken, gestoraA));
    expect(blocks.body.map((b: { nome: string }) => b.nome)).not.toContain('Bloco 3');
  });

  it('gestora B não enxerga nem cadastra no condomínio da gestora A', async () => {
    const list = await t
      .http()
      .get(`/condominios/${condoA}/units`)
      .set(auth(adminBToken, gestoraB));
    expect(list.status).toBe(200);
    expect(list.body).toEqual([]); // escopo da gestora B não alcança, RLS esconde

    const create = await t
      .http()
      .post(`/condominios/${condoA}/units`)
      .set(auth(adminBToken, gestoraB))
      .send({ numero: '999' });
    expect(create.status).toBe(404);

    const spoof = await t
      .http()
      .get(`/condominios/${condoB}/units`)
      .set(auth(adminToken, gestoraB));
    expect(spoof.status).toBe(403);
  });
});

describe('veículos', () => {
  it('normaliza placa, recusa duplicada ativa e remove de forma lógica', async () => {
    const [unit] = (
      await t.http().get(`/condominios/${condoA}/units`).set(auth(adminToken, gestoraA))
    ).body as { id: string }[];
    const base = `/condominios/${condoA}/units/${unit?.id}/vehicles`;

    const created = await t
      .http()
      .post(base)
      .set(auth(adminToken, gestoraA))
      .send({ placa: 'abc-1d23', modelo: 'Gol' });
    expect(created.status).toBe(201);
    expect(created.body.placa).toBe('ABC1D23');

    const dup = await t
      .http()
      .post(base)
      .set(auth(adminToken, gestoraA))
      .send({ placa: 'ABC1D23' });
    expect(dup.status).toBe(409);
    const invalid = await t
      .http()
      .post(base)
      .set(auth(adminToken, gestoraA))
      .send({ placa: '12345' });
    expect(invalid.status).toBe(400);

    const removed = await t
      .http()
      .delete(`${base}/${created.body.id}`)
      .set(auth(adminToken, gestoraA));
    expect(removed.status).toBe(204);
    expect((await t.http().get(base).set(auth(adminToken, gestoraA))).body).toEqual([]);
    const readd = await t
      .http()
      .post(base)
      .set(auth(adminToken, gestoraA))
      .send({ placa: 'ABC1D23' });
    expect(readd.status).toBe(201);
  });
});

describe('proprietário e acesso do morador', () => {
  let unitId: string;
  let otherUnitId: string;
  let ownerEmail: string;
  let moradorToken: string;
  let grantId: string;

  beforeAll(async () => {
    const units = (
      await t.http().get(`/condominios/${condoA}/units`).set(auth(adminToken, gestoraA))
    ).body as { id: string; numero: string }[];
    unitId = units.find((u) => u.numero === '101')?.id ?? '';
    otherUnitId = units.find((u) => u.numero === '102')?.id ?? '';
    ownerEmail = uniqueEmail('dono');
  });

  it('gestora cadastra o proprietário; CPF volta mascarado e o convite é enviado', async () => {
    const auditBefore = await countAudit({ action: 'unit_grant.created', gestoraId: gestoraA });
    const res = await t
      .http()
      .post(`/condominios/${condoA}/units/${unitId}/grants/owner`)
      .set(auth(adminToken, gestoraA))
      .send({ nome: 'Maria Dona', cpf: '529.982.247-25', email: ownerEmail });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      perfil: 'proprietario',
      permissoes: ['avisos', 'reservas', 'portaria', 'pagamento', 'contas'],
      pessoa: { nome: 'Maria Dona', cpfMascarado: '***.982.247-**', temAcesso: true },
    });
    expect(JSON.stringify(res.body)).not.toContain('52998224725');
    grantId = res.body.id;
    expect(await countAudit({ action: 'unit_grant.created', gestoraId: gestoraA })).toBe(
      auditBefore + 1,
    );

    // A auditoria também não guarda o CPF completo.
    const { rows } = await testPools().admin.query<{ after: unknown }>(
      `SELECT after FROM audit_log WHERE resource_id = $1`,
      [grantId],
    );
    expect(JSON.stringify(rows)).not.toContain('52998224725');

    const dup = await t
      .http()
      .post(`/condominios/${condoA}/units/${unitId}/grants/owner`)
      .set(auth(adminToken, gestoraA))
      .send({ nome: 'Maria Dona', email: ownerEmail });
    expect(dup.status).toBe(409);
  });

  it('o morador entra pelo convite e vê só a própria unidade', async () => {
    const token = t.mailer.lastTokenFor(ownerEmail);
    const consumed = await t.http().post('/auth/magic-link/consume').send({ token });
    expect(consumed.body.status).toBe('authenticated'); // morador não exige 2FA
    moradorToken = consumed.body.accessToken;

    const me = await t.http().get('/me').set('Authorization', `Bearer ${moradorToken}`);
    expect(me.body.gestoras).toEqual([
      expect.objectContaining({
        id: gestoraA,
        roles: [
          {
            key: 'morador',
            name: 'Morador',
            scope: { type: 'unit', condominioId: condoA, unitId },
          },
        ],
      }),
    ]);

    const own = await t
      .http()
      .get(`/condominios/${condoA}/units/${unitId}`)
      .set(auth(moradorToken, gestoraA));
    expect(own.status).toBe(200);
    expect(own.body.numero).toBe('101');

    const other = await t
      .http()
      .get(`/condominios/${condoA}/units/${otherUnitId}`)
      .set(auth(moradorToken, gestoraA));
    expect(other.status).toBe(403);
    const list = await t
      .http()
      .get(`/condominios/${condoA}/units`)
      .set(auth(moradorToken, gestoraA));
    expect(list.status).toBe(403);
    const grants = await t
      .http()
      .get(`/condominios/${condoA}/units/${unitId}/grants`)
      .set(auth(moradorToken, gestoraA));
    expect(grants.status).toBe(403);
  });

  it('síndico convida morador, mas não cadastra unidades', async () => {
    const sindico: TestUser = await createUser({ withTotp: true, prefix: 'sindico' });
    await assignRole(sindico.id, gestoraA, 'sindico', { condominioId: condoA });
    const token = await login(t, sindico);

    const invite = await t
      .http()
      .post(`/condominios/${condoA}/units/${otherUnitId}/grants/owner`)
      .set(auth(token, gestoraA))
      .send({ nome: 'João Dono', email: uniqueEmail('joao') });
    expect(invite.status).toBe(201);

    const create = await t
      .http()
      .post(`/condominios/${condoA}/units`)
      .set(auth(token, gestoraA))
      .send({ numero: '9999' });
    expect(create.status).toBe(403);
  });

  it('papel de morador não pode ser atribuído direto à gestora', async () => {
    const { rows } = await testPools().admin.query<{ id: string }>(
      "SELECT id FROM role WHERE gestora_id IS NULL AND key = 'morador'",
    );
    const user = await createUser();
    const res = await t
      .http()
      .post('/role-assignments')
      .set(auth(adminToken, gestoraA))
      .send({ userId: user.id, roleId: rows[0]?.id, scope: { type: 'gestora' } });
    expect(res.status).toBe(400);
  });

  it('revogar o vínculo corta o acesso na hora, mesmo com o token ainda válido', async () => {
    const res = await t
      .http()
      .delete(`/condominios/${condoA}/units/${unitId}/grants/${grantId}`)
      .set(auth(adminToken, gestoraA));
    expect(res.status).toBe(204);
    const own = await t
      .http()
      .get(`/condominios/${condoA}/units/${unitId}`)
      .set(auth(moradorToken, gestoraA));
    expect(own.status).toBe(403);
  });
});
