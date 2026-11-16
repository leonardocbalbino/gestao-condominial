/**
 * Aceite da Fase 1 (CLAUDE.md §10), ponta a ponta com o adaptador Fake:
 * gerar rateio → emitir cobrança → simular pagamento por webhook (inclusive duplicado) →
 * ver baixa → conciliar → fechar o mês com balancete correto.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { todayInBrazil } from '../src/common/dates';
import { FakePaymentProvider } from '../src/modules/billing/provider/fake.provider';
import { PAYMENT_PROVIDER } from '../src/modules/billing/provider/payment-provider';
import { createTestApp, login, type TestApp } from './support/app';
import {
  assignRole,
  closeTestPools,
  createCondominio,
  createGestora,
  createUser,
  randomCpf,
  testPools,
  uniqueEmail,
  waitForOutbox,
} from './support/db';

let t: TestApp;
let gestora: string;
let gestoraB: string;
let condo: string;
let admin: string;
let adminB: string;
let sindico: string;
let conselheiro: string;
let fake: FakePaymentProvider;

const auth = (token: string, gestoraId = gestora) => ({
  Authorization: `Bearer ${token}`,
  'x-gestora-id': gestoraId,
});
const base = () => `/condominios/${condo}`;

const today = todayInBrazil();
const competencia = today.slice(0, 7);
const [yy, , dd] = today.split('-').map(Number) as [number, number, number];
// Vencimento amanhã (até o dia 28): a cobrança ainda não está em atraso.
const vencimento = `${competencia}-${String(Math.min(28, dd + 1)).padStart(2, '0')}`;
const vencimentoNoFuturo = dd < 28;

const units: Record<string, string> = {};
const owners: Record<string, string> = {};
let accounts: Record<string, string>;

beforeAll(async () => {
  t = await createTestApp();
  fake = t.app.get(PAYMENT_PROVIDER);
  gestora = await createGestora();
  gestoraB = await createGestora();
  condo = await createCondominio(gestora, 'Residencial Aceite');

  const a = await createUser({ withTotp: true, prefix: 'gestora' });
  await assignRole(a.id, gestora, 'gestora_admin');
  admin = await login(t, a);
  const s = await createUser({ withTotp: true, prefix: 'sindico' });
  await assignRole(s.id, gestora, 'sindico', { condominioId: condo });
  sindico = await login(t, s);
  const c = await createUser({ withTotp: true, prefix: 'conselho' });
  await assignRole(c.id, gestora, 'conselheiro', { condominioId: condo });
  conselheiro = await login(t, c);
  const b = await createUser({ withTotp: true, prefix: 'gestora-b' });
  await assignRole(b.id, gestoraB, 'gestora_admin');
  adminB = await login(t, b);
});

afterAll(async () => {
  await t.close();
  await closeTestPools();
});

describe('preparação do condomínio', () => {
  it('unidades com fração ideal, proprietários, contabilidade, broker e orçamento', async () => {
    const imported = await t.http().post(`${base()}/units/import`).set(auth(admin)).send({
      csv: 'bloco;andar;numero;fracao_ideal\nTorre A;1;101;0,3\nTorre A;1;102;0,3\nTorre A;2;201;0,2\nTorre A;2;202;0,2',
    });
    expect(imported.status).toBe(201);
    const list = await t.http().get(`${base()}/units`).set(auth(admin));
    for (const u of list.body as { id: string; numero: string }[]) units[u.numero] = u.id;

    for (const numero of ['101', '102', '201', '202']) {
      owners[numero] = uniqueEmail(`dono-${numero}`);
      const res = await t
        .http()
        .post(`${base()}/units/${units[numero]}/grants/owner`)
        .set(auth(admin))
        .send({ nome: `Proprietário ${numero}`, cpf: randomCpf(), email: owners[numero] });
      expect(res.status).toBe(201);
    }

    const setup = await t
      .http()
      .post(`${base()}/ledger/setup`)
      .set(auth(admin))
      .send({ mesInicial: competencia, saldoInicialCentavos: 1_000_000 });
    expect(setup.status).toBe(201);
    const accs = await t.http().get(`${base()}/ledger/accounts`).set(auth(admin));
    accounts = Object.fromEntries(
      (accs.body as { codigo: string; id: string }[]).map((x) => [x.codigo, x.id]),
    );

    const account = await t
      .http()
      .post(`${base()}/billing/account`)
      .set(auth(admin))
      .send({
        email: 'financeiro@residencial-aceite.local',
        telefone: '(11) 3000-0000',
        faturamentoMensalCentavos: 4_400_00,
        endereco: {
          cep: '01000-000',
          logradouro: 'Rua Fictícia',
          numero: '100',
          bairro: 'Centro',
          cidade: 'São Paulo',
          uf: 'sp',
        },
      });
    expect(account.status).toBe(201);
    expect(account.body.webhookPath).toBe(`/webhooks/fake/${gestora}/${condo}`);

    const budget = await t
      .http()
      .post(`${base()}/budgets`)
      .set(auth(admin))
      .send({
        ano: yy,
        linhas: [
          { accountId: accounts['4.2.02'], valorMensalCentavos: 300_000, criterio: 'fracao_ideal' },
          { accountId: accounts['4.3.04'], valorMensalCentavos: 100_000, criterio: 'igualitario' },
        ],
      });
    expect(budget.status).toBe(201);
    expect(budget.body.totalMensalCentavos).toBe(400_000);
    const approved = await t
      .http()
      .post(`${base()}/budgets/${budget.body.id}/approve`)
      .set(auth(admin));
    expect(approved.body.status).toBe('aprovado');
  });
});

describe('rateio e emissão', () => {
  it('prévia: fração ideal + igualitário + 10% de fundo de reserva, centavo a centavo', async () => {
    const res = await t
      .http()
      .get(`${base()}/rateio/preview`)
      .query({ competencia, vencimento })
      .set(auth(admin));
    expect(res.status).toBe(200);
    expect(res.body.pendencias).toEqual([]);
    expect(res.body.totalCentavos).toBe(440_000);
    const byUnit = Object.fromEntries(
      (
        res.body.unidades as {
          unidade: string;
          taxaCentavos: number;
          fundoReservaCentavos: number;
        }[]
      ).map((u) => [u.unidade, [u.taxaCentavos, u.fundoReservaCentavos]]),
    );
    expect(byUnit).toEqual({
      'Torre A · 101': [115_000, 11_500],
      'Torre A · 102': [115_000, 11_500],
      'Torre A · 201': [85_000, 8_500],
      'Torre A · 202': [85_000, 8_500],
    });
  });

  it('emite as cobranças no broker (assíncrono, via outbox) e não emite duas vezes', async () => {
    const res = await t
      .http()
      .post(`${base()}/rateio/emit`)
      .set(auth(admin))
      .send({ competencia, vencimento });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ cobrancas: 4 });

    await waitForOutbox(gestora);
    const charges = await t.http().get(`${base()}/charges`).query({ competencia }).set(auth(admin));
    expect(charges.body).toHaveLength(4);
    for (const c of charges.body as {
      status: string;
      pixCopiaCola: string;
      linhaDigitavel: string;
    }[]) {
      expect(c.status).toBe('emitida');
      expect(c.pixCopiaCola).toBeTruthy();
      expect(c.linhaDigitavel).toMatch(/^\d{47}$/);
    }

    const again = await t
      .http()
      .post(`${base()}/rateio/emit`)
      .set(auth(admin))
      .send({ competencia, vencimento });
    expect(again.status).toBe(409);
  });

  it('o morador vê só a própria taxa, em linguagem simples e com Pix', async () => {
    const token = t.mailer.lastTokenFor(owners['101'] ?? '');
    const session = await t.http().post('/auth/magic-link/consume').send({ token });
    const morador = session.body.accessToken as string;

    const own = await t.http().get(`${base()}/units/${units['101']}/charges`).set(auth(morador));
    expect(own.status).toBe(200);
    expect(own.body).toHaveLength(1);
    expect(own.body[0]).toMatchObject({
      titulo: expect.stringMatching(/^Sua taxa de [a-zç]+$/),
      valorCentavos: 126_500,
      pixCopiaCola: expect.any(String),
      ...(vencimentoNoFuturo ? { atrasada: false, valorAtualizadoCentavos: 126_500 } : {}),
    });

    expect(
      (await t.http().get(`${base()}/units/${units['102']}/charges`).set(auth(morador))).status,
    ).toBe(403);
    expect((await t.http().get(`${base()}/charges`).set(auth(morador))).status).toBe(403);
    expect((await t.http().get(`${base()}/charges/inadimplencia`).set(auth(morador))).status).toBe(
      403,
    );
  });
});

describe('pagamento por webhook', () => {
  let chargeId: string;
  let delivery: { path: string; headers: Record<string, string>; body: object };

  beforeAll(async () => {
    const charges = await t.http().get(`${base()}/charges`).query({ competencia }).set(auth(admin));
    chargeId = (charges.body as { id: string; unidade: string }[]).find(
      (c) => c.unidade === 'Torre A · 101',
    )?.id as string;
    const sim = await t
      .http()
      .post(`${base()}/charges/${chargeId}/simulate-payment`)
      .set(auth(admin))
      .send({ pagoEm: today });
    expect(sim.status).toBe(201);
    delivery = sim.body;
  });

  it('webhook com token errado é recusado e não grava nada', async () => {
    const res = await t
      .http()
      .post(delivery.path)
      .set({ 'x-fake-webhook-token': 'forjado' })
      .send(delivery.body);
    expect(res.status).toBe(401);
    const { rows } = await testPools().admin.query(
      'SELECT 1 FROM payment_event WHERE condominio_id = $1',
      [condo],
    );
    expect(rows).toHaveLength(0);
  });

  it('webhook de outra gestora na rota não acha a conta', async () => {
    const forged = delivery.path.replace(gestora, gestoraB);
    const res = await t.http().post(forged).set(delivery.headers).send(delivery.body);
    expect(res.status).toBe(404);
  });

  it('webhook duplicado não duplica a baixa', async () => {
    const first = await t.http().post(delivery.path).set(delivery.headers).send(delivery.body);
    expect(first.status).toBe(200);
    expect(first.body).toEqual({ recebido: true, duplicado: false });
    const second = await t.http().post(delivery.path).set(delivery.headers).send(delivery.body);
    expect(second.body).toEqual({ recebido: true, duplicado: true });

    await waitForOutbox(gestora);
    // Reentrega tardia (depois de processado) também não duplica.
    const third = await t.http().post(delivery.path).set(delivery.headers).send(delivery.body);
    expect(third.body.duplicado).toBe(true);
    await waitForOutbox(gestora);

    const { rows } = await testPools().admin.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM journal_entry WHERE condominio_id = $1 AND origem = 'recebimento'`,
      [condo],
    );
    expect(rows[0]?.n).toBe(1);
  });

  it('baixa: cobrança paga e lançamento com líquido no banco, tarifas e receitas por destino', async () => {
    const charges = await t.http().get(`${base()}/charges`).query({ competencia }).set(auth(admin));
    const paid = (charges.body as { id: string; status: string; valorPagoCentavos: number }[]).find(
      (c) => c.id === chargeId,
    );
    expect(paid).toMatchObject({ status: 'paga', valorPagoCentavos: 126_500 });

    const periods = await t.http().get(`${base()}/ledger/periods`).set(auth(admin));
    const period = periods.body.find((p: { mes: string }) => p.mes === competencia);
    const entries = await t
      .http()
      .get(`${base()}/ledger/periods/${period.id}/entries`)
      .set(auth(admin));
    const recebimento = entries.body.find((e: { origem: string }) => e.origem === 'recebimento');
    const lines = Object.fromEntries(
      recebimento.linhas.map((l: { codigo: string; valorCentavos: number }) => [
        l.codigo,
        l.valorCentavos,
      ]),
    );
    // 1.265,00 pagos; tarifa do broker 1,99 + plataforma 1,50 → líquido 1.261,51.
    expect(lines).toEqual({
      '1.1.01': 126_151,
      '4.7.01': 349,
      '3.1.01': -115_000,
      '3.2.01': -11_500,
    });
  });

  it('inadimplência nominal: só para gestora, síndico e conselho', async () => {
    for (const token of [admin, sindico, conselheiro]) {
      expect((await t.http().get(`${base()}/charges/inadimplencia`).set(auth(token))).status).toBe(
        200,
      );
    }
  });
});

describe('contas a pagar com aprovação', () => {
  let payableId: string;

  it('sem comprovante não cadastra; acima do limite exige segunda assinatura', async () => {
    const noReceipt = await t.http().post(`${base()}/payables`).set(auth(admin)).send({
      fornecedor: 'Energia Fictícia S.A.',
      descricao: 'Conta de luz das áreas comuns',
      accountId: accounts['4.2.02'],
      valorCentavos: 600_000,
      vencimento,
    });
    expect(noReceipt.status).toBe(400);

    const att = await t
      .http()
      .post(`${base()}/attachments`)
      .set(auth(admin))
      .attach('file', Buffer.from('%PDF-1.4\n% fatura fictícia\n%%EOF\n'), 'fatura.pdf');
    const res = await t.http().post(`${base()}/payables`).set(auth(admin)).send({
      fornecedor: 'Energia Fictícia S.A.',
      descricao: 'Conta de luz das áreas comuns',
      accountId: accounts['4.2.02'],
      valorCentavos: 600_000,
      vencimento,
      comprovanteId: att.body.id,
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      status: 'aguardando_aprovacao',
      requerSegundaAprovacao: true,
    });
    payableId = res.body.id;
  });

  it('gestora não aprova; síndico aprova; conselheiro dá a segunda assinatura', async () => {
    const path = `${base()}/payables/${payableId}`;
    expect((await t.http().post(`${path}/approve`).set(auth(admin))).status).toBe(403);
    expect((await t.http().post(`${path}/pay`).set(auth(admin))).status).toBe(409);

    const first = await t.http().post(`${path}/approve`).set(auth(sindico));
    expect(first.body.status).toBe('aguardando_segunda_aprovacao');
    expect((await t.http().post(`${path}/approve-second`).set(auth(sindico))).status).toBe(403);

    const second = await t.http().post(`${path}/approve-second`).set(auth(conselheiro));
    expect(second.body.status).toBe('aprovada');
  });

  it('pagamento pelo broker lança a despesa com o comprovante', async () => {
    const res = await t.http().post(`${base()}/payables/${payableId}/pay`).set(auth(admin));
    expect(res.body.status).toBe('pagamento_solicitado');
    await waitForOutbox(gestora);
    const list = await t.http().get(`${base()}/payables`).set(auth(admin));
    expect(list.body.find((p: { id: string }) => p.id === payableId)).toMatchObject({
      status: 'paga',
      pagoEm: today,
    });
  });
});

describe('conciliação e fechamento', () => {
  let periodId: string;

  beforeAll(async () => {
    const periods = await t.http().get(`${base()}/ledger/periods`).set(auth(admin));
    periodId = periods.body.find((p: { mes: string }) => p.mes === competencia).id;
  });

  it('casa recebimento e pagamento; movimentação sem origem vira exceção e trava o mês', async () => {
    const creds = await testPools().admin.query<{ provider_account_id: string }>(
      'SELECT provider_account_id FROM payment_account WHERE condominio_id = $1',
      [condo],
    );
    fake.addStatementEntry(creds.rows[0]?.provider_account_id ?? '', {
      data: today,
      valorCentavos: -500,
      descricao: 'Tarifa avulsa não esperada',
      ref: null,
    });

    const run = await t.http().post(`${base()}/reconciliation/run`).set(auth(admin));
    expect(run.status).toBe(201);
    expect(run.body).toEqual({ importadas: 3, conciliadas: 2, excecoes: 1 });
    const rerun = await t.http().post(`${base()}/reconciliation/run`).set(auth(admin));
    expect(rerun.body.importadas).toBe(0);

    const blocked = await t
      .http()
      .post(`${base()}/ledger/periods/${periodId}/close`)
      .set(auth(admin));
    expect(blocked.status).toBe(409);
    expect(blocked.body.motivos[0]).toMatch(/conciliação/);
  });

  it('gestora trata a exceção, fecha o mês e o balancete bate', async () => {
    const exceptions = await t
      .http()
      .get(`${base()}/reconciliation/lines`)
      .query({ status: 'excecao' })
      .set(auth(admin));
    expect(exceptions.body).toHaveLength(1);
    const resolved = await t
      .http()
      .post(`${base()}/reconciliation/lines/${exceptions.body[0].id}/resolve`)
      .set(auth(admin))
      .send({ acao: 'justificar', nota: 'Tarifa contestada com o broker' });
    expect(resolved.body.status).toBe('resolvida');

    const closed = await t
      .http()
      .post(`${base()}/ledger/periods/${periodId}/close`)
      .set(auth(admin));
    expect(closed.status).toBe(201);
    expect(closed.body.hash).toMatch(/^[0-9a-f]{64}$/);

    const b = await t
      .http()
      .get(`${base()}/ledger/periods/${periodId}/balancete`)
      .set(auth(sindico));
    expect(b.body.totais).toEqual({
      receitasCentavos: 126_500,
      despesasCentavos: 600_349,
      resultadoCentavos: 126_500 - 600_349,
      // 10.000,00 inicial + 1.261,51 líquido − 6.000,00 de luz.
      caixaFinalCentavos: 1_000_000 + 126_151 - 600_000,
      fundos: { ordinaria: 115_000 - 600_349, fundo_reserva: 11_500, obras: 0 },
    });
    const verify = await t
      .http()
      .get(`${base()}/ledger/periods/${periodId}/verify`)
      .set(auth(conselheiro));
    expect(verify.body.ok).toBe(true);
  });
});

describe('isolamento', () => {
  it('gestora B não vê cobranças, contas a pagar nem extrato da gestora A', async () => {
    for (const path of ['charges', 'payables', 'reconciliation/lines']) {
      const res = await t.http().get(`${base()}/${path}`).set(auth(adminB, gestoraB));
      expect(res.body).toEqual([]);
    }
  });
});
