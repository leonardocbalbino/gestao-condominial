/**
 * Aceite da Etapa 4 (Visão geral): condomínio novo começa em 0 de 5 e, com o adaptador
 * Fake, cada passo concluído aparece no endpoint até a implantação ficar completa.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { todayInBrazil } from '../src/common/dates';
import { createTestApp, login, type TestApp } from './support/app';
import {
  assignRole,
  closeTestPools,
  countAudit,
  createCondominio,
  createGestora,
  createUser,
  uniqueEmail,
  waitForOutbox,
} from './support/db';

let t: TestApp;
let gestora: string;
let gestoraB: string;
let condo: string;
let admin: string;
let adminB: string;

const auth = (token: string, gestoraId = gestora) => ({
  Authorization: `Bearer ${token}`,
  'x-gestora-id': gestoraId,
});
const base = () => `/condominios/${condo}`;
const status = async () => {
  const res = await t.http().get(`${base()}/implantacao`).set(auth(admin));
  expect(res.status).toBe(200);
  return res.body as {
    concluidos: number;
    completo: boolean;
    passos: { chave: string; concluido: boolean; resumo: string | null; bloqueadoPor: string[] }[];
  };
};
const passo = (s: Awaited<ReturnType<typeof status>>, chave: string) =>
  s.passos.find((p) => p.chave === chave);

const today = todayInBrazil();
const competencia = today.slice(0, 7);
const [ano, , dia] = today.split('-').map(Number) as [number, number, number];
const vencimento = `${competencia}-${String(Math.min(28, dia + 1)).padStart(2, '0')}`;

beforeAll(async () => {
  t = await createTestApp();
  gestora = await createGestora();
  gestoraB = await createGestora();
  condo = await createCondominio(gestora, 'Edifício Jacarandá');
  const a = await createUser({ withTotp: true, prefix: 'gestora' });
  await assignRole(a.id, gestora, 'gestora_admin');
  admin = await login(t, a);
  const b = await createUser({ withTotp: true, prefix: 'gestora-b' });
  await assignRole(b.id, gestoraB, 'gestora_admin');
  adminB = await login(t, b);
});

afterAll(async () => {
  await t.close();
  await closeTestPools();
});

describe('implantação do condomínio', () => {
  it('condomínio novo: 0 de 5, primeira cobrança bloqueada', async () => {
    const s = await status();
    expect(s).toMatchObject({ concluidos: 0, completo: false });
    expect(passo(s, 'cobranca')?.bloqueadoPor).toEqual(['unidades', 'conta', 'contabilidade']);
  });

  it('outra gestora não enxerga a implantação', async () => {
    const res = await t.http().get(`${base()}/implantacao`).set(auth(adminB, gestoraB));
    expect([403, 404]).toContain(res.status);
  });

  it('unidades, conta de pagamentos e contabilidade concluem os três primeiros passos', async () => {
    const gen = await t
      .http()
      .post(`${base()}/blocks/generate`)
      .set(auth(admin))
      .send({ nome: 'Torre A', andares: 2, unidadesPorAndar: 2, andarInicial: 1 });
    expect(gen.status).toBe(201);
    expect(passo(await status(), 'unidades')).toMatchObject({
      concluido: true,
      resumo: '4 unidades em Torre A',
    });

    const account = await t
      .http()
      .post(`${base()}/billing/account`)
      .set(auth(admin))
      .send({
        email: 'financeiro@jacaranda.local',
        telefone: '(11) 3000-0000',
        faturamentoMensalCentavos: 400_000,
        endereco: {
          cep: '01000-000',
          logradouro: 'Rua Fictícia',
          numero: '200',
          bairro: 'Centro',
          cidade: 'São Paulo',
          uf: 'sp',
        },
      });
    expect(account.status).toBe(201);

    const setup = await t
      .http()
      .post(`${base()}/ledger/setup`)
      .set(auth(admin))
      .send({ mesInicial: competencia, saldoInicialCentavos: 0 });
    expect(setup.status).toBe(201);

    const s = await status();
    expect(s.concluidos).toBe(3);
    expect(passo(s, 'conta')?.resumo).toBe('Conta simulada aberta (homologação)');
    expect(passo(s, 'cobranca')).toMatchObject({ concluido: false, bloqueadoPor: [] });
  });

  it('síndico convidado conclui a equipe; convite pendente pode ser reenviado (auditado)', async () => {
    const email = uniqueEmail('sindica');
    const invite = await t
      .http()
      .post(`${base()}/staff-invites`)
      .set(auth(admin))
      .send({ nome: 'Marta Síndica', email, papel: 'sindico' });
    expect(invite.status).toBe(201);

    const list = await t.http().get(`${base()}/staff-invites`).set(auth(admin));
    expect(list.status).toBe(200);
    expect(list.body).toEqual([
      expect.objectContaining({
        assignmentId: invite.body.id,
        nome: 'Marta Síndica',
        email,
        papel: 'sindico',
        status: 'pendente',
      }),
    ]);

    const before = await countAudit({
      action: 'role_assignment.invite_resent',
      gestoraId: gestora,
    });
    const resend = await t
      .http()
      .post(`${base()}/staff-invites/${invite.body.id}/resend`)
      .set(auth(admin));
    expect(resend.status).toBe(201);
    expect(await countAudit({ action: 'role_assignment.invite_resent', gestoraId: gestora })).toBe(
      before + 1,
    );

    expect(passo(await status(), 'equipe')).toMatchObject({
      concluido: true,
      resumo: '1 síndico · 1 convite pendente',
    });
  });

  it('primeira cobrança emitida completa a implantação', async () => {
    const accs = await t.http().get(`${base()}/ledger/accounts`).set(auth(admin));
    const conta = (accs.body as { codigo: string; id: string }[]).find(
      (x) => x.codigo === '4.3.04',
    );
    const budget = await t
      .http()
      .post(`${base()}/budgets`)
      .set(auth(admin))
      .send({
        ano,
        linhas: [{ accountId: conta?.id, valorMensalCentavos: 200_000, criterio: 'igualitario' }],
      });
    expect(budget.status).toBe(201);
    await t.http().post(`${base()}/budgets/${budget.body.id}/approve`).set(auth(admin));
    const emit = await t
      .http()
      .post(`${base()}/rateio/emit`)
      .set(auth(admin))
      .send({ competencia, vencimento });
    expect(emit.status).toBe(201);
    await waitForOutbox(gestora);

    const s = await status();
    expect(s).toMatchObject({ concluidos: 5, completo: true });
    expect(passo(s, 'cobranca')?.resumo).toBe('4 cobranças emitidas');
  });
});
