import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp, login, type TestApp } from './support/app';
import {
  assignRole,
  closeTestPools,
  countAudit,
  createCondominio,
  createGestora,
  createUser,
  uniqueEmail,
} from './support/db';

let t: TestApp;
let gestora: string;
let condo: string;
let unitId: string;
let admin: string;
let sindico: string;
let morador: string;

const auth = (token: string) => ({ Authorization: `Bearer ${token}`, 'x-gestora-id': gestora });
const base = () => `/condominios/${condo}`;

beforeAll(async () => {
  t = await createTestApp();
  gestora = await createGestora();
  condo = await createCondominio(gestora, 'Residencial Comunicados');
  const a = await createUser({ withTotp: true, prefix: 'admin' });
  await assignRole(a.id, gestora, 'gestora_admin');
  admin = await login(t, a);
  const s = await createUser({ withTotp: true, prefix: 'sindico' });
  await assignRole(s.id, gestora, 'sindico', { condominioId: condo });
  sindico = await login(t, s);

  const unit = await t
    .http()
    .post(`${base()}/units`)
    .set(auth(admin))
    .send({ numero: '12', tipo: 'casa' });
  unitId = unit.body.id;
  const email = uniqueEmail('morador');
  await t
    .http()
    .post(`${base()}/units/${unitId}/grants/owner`)
    .set(auth(admin))
    .send({ nome: 'Dona Lourdes', email });
  const session = await t
    .http()
    .post('/auth/magic-link/consume')
    .send({ token: t.mailer.lastTokenFor(email) });
  morador = session.body.accessToken;
});

afterAll(async () => {
  await t.close();
  await closeTestPools();
});

describe('comunicados', () => {
  let announcementId: string;

  it('síndico publica; morador não publica', async () => {
    const res = await t
      .http()
      .post(`${base()}/announcements`)
      .set(auth(sindico))
      .send({ titulo: 'Manutenção da caixa d’água', corpo: 'Sábado, das 8h às 12h, sem água.' });
    expect(res.status).toBe(201);
    announcementId = res.body.id;

    const denied = await t
      .http()
      .post(`${base()}/announcements`)
      .set(auth(morador))
      .send({ titulo: 'Festa', corpo: 'Na minha casa' });
    expect(denied.status).toBe(403);
  });

  it('tela inicial do morador: sem pendência financeira, comunicado não lido no topo', async () => {
    const home = await t.http().get(`${base()}/units/${unitId}/home`).set(auth(morador));
    expect(home.status).toBe(200);
    expect(home.body).toMatchObject({
      condominioNome: 'Residencial Comunicados',
      unidade: '12',
      primeiroNome: 'Dona',
      pendencia: null,
      comunicadosNaoLidos: [{ id: announcementId, lido: false }],
      avisosDoDia: [],
    });
  });

  it('"Li e entendi" registra a confirmação (auditada) e tira o comunicado do topo', async () => {
    const before = await countAudit({ action: 'announcement.read', gestoraId: gestora });
    const read = await t
      .http()
      .post(`${base()}/units/${unitId}/announcements/${announcementId}/read`)
      .set(auth(morador));
    expect(read.status).toBe(201);
    expect(read.body.lido).toBe(true);
    expect(await countAudit({ action: 'announcement.read', gestoraId: gestora })).toBe(before + 1);

    const home = await t.http().get(`${base()}/units/${unitId}/home`).set(auth(morador));
    expect(home.body.comunicadosNaoLidos).toEqual([]);

    const stats = await t.http().get(`${base()}/announcements`).set(auth(admin));
    expect(stats.body[0]).toMatchObject({ id: announcementId, confirmacoes: 1 });
  });
});
