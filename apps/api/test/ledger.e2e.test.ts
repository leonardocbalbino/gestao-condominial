import { createHash } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { todayInBrazil } from '../src/common/dates';
import { createTestApp, login, type TestApp } from './support/app';
import {
  assignRole,
  closeTestPools,
  createCondominio,
  createGestora,
  createUser,
  testPools,
  withContext,
} from './support/db';

let t: TestApp;
let gestoraA: string;
let gestoraB: string;
let condo: string;
let token: string;
let tokenB: string;

const auth = (tk: string, gestoraId: string) => ({
  Authorization: `Bearer ${tk}`,
  'x-gestora-id': gestoraId,
});

// Mês passado (aberto para lançamentos) e mês atual, calculados a partir de hoje.
const today = todayInBrazil();
const [y, m] = today.split('-').map(Number) as [number, number];
const lastMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
const thisMonth = today.slice(0, 7);
const dayOf = (month: string, day: number) => `${month}-${String(day).padStart(2, '0')}`;

const PDF = Buffer.from('%PDF-1.4\n% comprovante fictício de teste\n%%EOF\n');

let accounts: Record<string, string>;
const base = () => `/condominios/${condo}/ledger`;

beforeAll(async () => {
  t = await createTestApp();
  gestoraA = await createGestora();
  gestoraB = await createGestora();
  condo = await createCondominio(gestoraA);
  const admin = await createUser({ withTotp: true, prefix: 'admin' });
  await assignRole(admin.id, gestoraA, 'gestora_admin');
  token = await login(t, admin);
  const adminB = await createUser({ withTotp: true, prefix: 'admin-b' });
  await assignRole(adminB.id, gestoraB, 'gestora_admin');
  tokenB = await login(t, adminB);
});

afterAll(async () => {
  await t.close();
  await closeTestPools();
});

async function upload(content: Buffer, name: string) {
  return t
    .http()
    .post(`/condominios/${condo}/attachments`)
    .set(auth(token, gestoraA))
    .attach('file', content, name);
}

async function balancete(periodId: string) {
  const res = await t
    .http()
    .get(`${base()}/periods/${periodId}/balancete`)
    .set(auth(token, gestoraA));
  expect(res.status).toBe(200);
  return res.body;
}

describe('início da contabilidade', () => {
  it('copia o plano padrão, abre o mês e lança o saldo inicial', async () => {
    const res = await t
      .http()
      .post(`${base()}/setup`)
      .set(auth(token, gestoraA))
      .send({ mesInicial: lastMonth, saldoInicialCentavos: 100_000 });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ mes: lastMonth, status: 'aberto', hash: null });

    const list = await t.http().get(`${base()}/accounts`).set(auth(token, gestoraA));
    accounts = Object.fromEntries(
      (list.body as { codigo: string; id: string }[]).map((a) => [a.codigo, a.id]),
    );
    expect(accounts['1.1.01']).toBeDefined();
    expect(accounts['4.2.02']).toBeDefined();

    const again = await t
      .http()
      .post(`${base()}/setup`)
      .set(auth(token, gestoraA))
      .send({ mesInicial: lastMonth });
    expect(again.status).toBe(409);

    const b = await balancete(res.body.id);
    expect(b.totais.caixaFinalCentavos).toBe(100_000);
  });
});

describe('lançamentos', () => {
  let periodId: string;
  let despesaId: string;

  beforeAll(async () => {
    const periods = await t.http().get(`${base()}/periods`).set(auth(token, gestoraA));
    periodId = periods.body.find((p: { mes: string }) => p.mes === lastMonth).id;
  });

  it('receita sem comprovante é aceita; partidas que não fecham são recusadas', async () => {
    const ok = await t
      .http()
      .post(`${base()}/entries`)
      .set(auth(token, gestoraA))
      .send({
        dataCompetencia: dayOf(lastMonth, 5),
        dataCaixa: dayOf(lastMonth, 5),
        historico: 'Taxa condominial recebida',
        linhas: [
          { accountId: accounts['1.1.01'], valorCentavos: 50_000 },
          { accountId: accounts['3.1.01'], valorCentavos: -50_000 },
        ],
      });
    expect(ok.status).toBe(201);
    expect(ok.body.periodId).toBe(periodId);

    const unbalanced = await t
      .http()
      .post(`${base()}/entries`)
      .set(auth(token, gestoraA))
      .send({
        dataCompetencia: dayOf(lastMonth, 5),
        dataCaixa: dayOf(lastMonth, 5),
        historico: 'Errado',
        linhas: [
          { accountId: accounts['1.1.01'], valorCentavos: 100 },
          { accountId: accounts['3.1.01'], valorCentavos: -99 },
        ],
      });
    expect(unbalanced.status).toBe(400);

    const synthetic = await t
      .http()
      .post(`${base()}/entries`)
      .set(auth(token, gestoraA))
      .send({
        dataCompetencia: dayOf(lastMonth, 5),
        dataCaixa: dayOf(lastMonth, 5),
        historico: 'Conta sintética',
        linhas: [
          { accountId: accounts['1.1.01'], valorCentavos: 100 },
          { accountId: accounts['3.1'], valorCentavos: -100 },
        ],
      });
    expect(synthetic.status).toBe(400);
  });

  it('sem comprovante, sem despesa; o anexo recebe SHA-256 no upload', async () => {
    const noReceipt = await t
      .http()
      .post(`${base()}/entries`)
      .set(auth(token, gestoraA))
      .send({
        dataCompetencia: dayOf(lastMonth, 10),
        dataCaixa: dayOf(lastMonth, 10),
        historico: 'Conta de luz',
        linhas: [
          { accountId: accounts['4.2.02'], valorCentavos: 30_000 },
          { accountId: accounts['1.1.01'], valorCentavos: -30_000 },
        ],
      });
    expect(noReceipt.status).toBe(400);

    const notPdf = await upload(Buffer.from('só texto'), 'nota.txt');
    expect(notPdf.status).toBe(400);

    const att = await upload(PDF, 'conta-luz.pdf');
    expect(att.status).toBe(201);
    expect(att.body.sha256).toBe(createHash('sha256').update(PDF).digest('hex'));

    const withReceipt = await t
      .http()
      .post(`${base()}/entries`)
      .set(auth(token, gestoraA))
      .send({
        dataCompetencia: dayOf(lastMonth, 10),
        dataCaixa: dayOf(lastMonth, 10),
        historico: 'Conta de luz',
        comprovanteId: att.body.id,
        linhas: [
          { accountId: accounts['4.2.02'], valorCentavos: 30_000 },
          { accountId: accounts['1.1.01'], valorCentavos: -30_000 },
        ],
      });
    expect(withReceipt.status).toBe(201);
    despesaId = withReceipt.body.id;

    const content = await t
      .http()
      .get(`/condominios/${condo}/attachments/${att.body.id}/content`)
      .set(auth(token, gestoraA));
    expect(content.status).toBe(200);
    expect(content.headers['x-content-sha256']).toBe(att.body.sha256);
  });

  it('o banco recusa saída sem comprovante e partidas desbalanceadas mesmo sem passar pela API', async () => {
    const insertEntry = (lines: [string, number][]) =>
      withContext(testPools().app, { gestoraId: gestoraA }, async (c) => {
        const { rows } = await c.query<{ id: string }>(
          `INSERT INTO journal_entry (gestora_id, condominio_id, period_id, data_competencia, data_caixa, historico, origem)
           VALUES ($1, $2, $3, $4, $4, 'Direto no banco', 'manual') RETURNING id`,
          [gestoraA, condo, periodId, dayOf(lastMonth, 11)],
        );
        for (const [acc, valor] of lines) {
          await c.query(
            `INSERT INTO journal_line (gestora_id, condominio_id, entry_id, account_id, valor_centavos)
             VALUES ($1, $2, $3, $4, $5)`,
            [gestoraA, condo, rows[0]?.id, acc, valor],
          );
        }
      });
    await expect(
      insertEntry([
        [accounts['4.2.02'] ?? '', 100],
        [accounts['1.1.01'] ?? '', -100],
      ]),
    ).rejects.toThrow(/comprovante/);
    await expect(
      insertEntry([
        [accounts['1.1.01'] ?? '', 100],
        [accounts['3.1.01'] ?? '', -90],
      ]),
    ).rejects.toThrow(/desbalanceado/);
  });

  it('o razão é imutável, inclusive para o superusuário', async () => {
    await expect(
      testPools().admin.query('UPDATE journal_line SET valor_centavos = 1 WHERE entry_id = $1', [
        despesaId,
      ]),
    ).rejects.toThrow(/imutável/);
    await expect(
      testPools().admin.query('DELETE FROM journal_entry WHERE id = $1', [despesaId]),
    ).rejects.toThrow(/imutável/);
  });

  it('correção é estorno: inverte as linhas, guarda o motivo e só acontece uma vez', async () => {
    const res = await t
      .http()
      .post(`${base()}/entries/${despesaId}/reverse`)
      .set(auth(token, gestoraA))
      .send({ motivo: 'Conta lançada em duplicidade' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ origem: 'estorno', estornoDe: despesaId });
    expect(res.body.linhas.map((l: { valorCentavos: number }) => l.valorCentavos).sort()).toEqual(
      [-30_000, 30_000].sort(),
    );

    const again = await t
      .http()
      .post(`${base()}/entries/${despesaId}/reverse`)
      .set(auth(token, gestoraA))
      .send({ motivo: 'De novo' });
    expect(again.status).toBe(409);

    const original = await t
      .http()
      .get(`${base()}/periods/${periodId}/entries`)
      .set(auth(token, gestoraA));
    expect(original.body.find((e: { id: string }) => e.id === despesaId).estornadoPor).toBe(
      res.body.id,
    );
  });
});

describe('balancete e fechamento', () => {
  let lastPeriod: string;

  beforeAll(async () => {
    const periods = await t.http().get(`${base()}/periods`).set(auth(token, gestoraA));
    lastPeriod = periods.body.find((p: { mes: string }) => p.mes === lastMonth).id;
  });

  it('balancete do mês: saldo inicial + receita − despesa', async () => {
    const b = await balancete(lastPeriod);
    // 1.000,00 inicial + 500,00 de taxa − 300,00 de luz (o estorno caiu no mês de hoje).
    expect(b.totais).toMatchObject({
      receitasCentavos: 50_000,
      despesasCentavos: 30_000,
      resultadoCentavos: 20_000,
      caixaFinalCentavos: 120_000,
    });
    const banco = b.linhas.find((l: { codigo: string }) => l.codigo === '1.1.01');
    expect(banco).toMatchObject({
      saldoAnteriorCentavos: 0,
      debitosCentavos: 150_000,
      creditosCentavos: 30_000,
      saldoFinalCentavos: 120_000,
    });
  });

  it('fecha o mês com hash verificável; período fechado não recebe lançamento', async () => {
    const closed = await t
      .http()
      .post(`${base()}/periods/${lastPeriod}/close`)
      .set(auth(token, gestoraA));
    expect(closed.status).toBe(201);
    expect(closed.body.status).toBe('em_revisao');
    expect(closed.body.hash).toMatch(/^[0-9a-f]{64}$/);

    const verify = await t
      .http()
      .get(`${base()}/periods/${lastPeriod}/verify`)
      .set(auth(token, gestoraA));
    expect(verify.body).toEqual({ ok: true, hash: closed.body.hash });

    // Lançamento com data do mês fechado entra no período aberto seguinte (§3.4).
    const late = await t
      .http()
      .post(`${base()}/entries`)
      .set(auth(token, gestoraA))
      .send({
        dataCompetencia: dayOf(lastMonth, 28),
        dataCaixa: dayOf(lastMonth, 28),
        historico: 'Taxa recebida no mês anterior, registrada depois',
        linhas: [
          { accountId: accounts['1.1.01'], valorCentavos: 10_000 },
          { accountId: accounts['3.1.01'], valorCentavos: -10_000 },
        ],
      });
    expect(late.status).toBe(201);
    expect(late.body.periodId).not.toBe(lastPeriod);
    expect(late.body.dataCaixa).toBe(dayOf(lastMonth, 28));

    await expect(
      withContext(testPools().app, { gestoraId: gestoraA }, (c) =>
        c.query(
          `INSERT INTO journal_entry (gestora_id, condominio_id, period_id, data_competencia, data_caixa, historico, origem)
           VALUES ($1, $2, $3, $4, $4, 'No mês fechado', 'manual')`,
          [gestoraA, condo, lastPeriod, dayOf(lastMonth, 28)],
        ),
      ),
    ).rejects.toThrow(/fechado/);

    expect((await balancete(lastPeriod)).totais.caixaFinalCentavos).toBe(120_000);
    const again = await t
      .http()
      .get(`${base()}/periods/${lastPeriod}/verify`)
      .set(auth(token, gestoraA));
    expect(again.body.ok).toBe(true);
  });

  it('o saldo final de um mês é o saldo anterior do seguinte', async () => {
    const periods = await t.http().get(`${base()}/periods`).set(auth(token, gestoraA));
    const current = periods.body.find((p: { mes: string }) => p.mes === thisMonth);
    const b = await balancete(current.id);
    const banco = b.linhas.find((l: { codigo: string }) => l.codigo === '1.1.01');
    // +300,00 do estorno da luz e +100,00 da taxa atrasada.
    expect(banco).toMatchObject({ saldoAnteriorCentavos: 120_000, saldoFinalCentavos: 160_000 });
  });

  it('meses fecham em ordem', async () => {
    const future = await t
      .http()
      .post(`${base()}/entries`)
      .set(auth(token, gestoraA))
      .send({
        dataCompetencia: dayOf(thisMonth, 1),
        dataCaixa: `${y + (m === 12 ? 1 : 0)}-${String((m % 12) + 1).padStart(2, '0')}-02`,
        historico: 'Rendimento do mês seguinte',
        linhas: [
          { accountId: accounts['1.1.01'], valorCentavos: 100 },
          { accountId: accounts['3.1.06'], valorCentavos: -100 },
        ],
      });
    expect(future.status).toBe(201);
    const res = await t
      .http()
      .post(`${base()}/periods/${future.body.periodId}/close`)
      .set(auth(token, gestoraA));
    expect(res.status).toBe(409);
  });
});

describe('permissões e isolamento', () => {
  it('síndico lê o balancete, mas não lança nem fecha o mês', async () => {
    const sindico = await createUser({ withTotp: true, prefix: 'sindico' });
    await assignRole(sindico.id, gestoraA, 'sindico', { condominioId: condo });
    const tk = await login(t, sindico);
    const periods = await t.http().get(`${base()}/periods`).set(auth(tk, gestoraA));
    expect(periods.status).toBe(200);
    const open = periods.body.find((p: { status: string }) => p.status === 'aberto');
    expect(
      (await t.http().get(`${base()}/periods/${open.id}/balancete`).set(auth(tk, gestoraA))).status,
    ).toBe(200);
    expect(
      (await t.http().post(`${base()}/periods/${open.id}/close`).set(auth(tk, gestoraA))).status,
    ).toBe(403);
    expect((await t.http().post(`${base()}/entries`).set(auth(tk, gestoraA)).send({})).status).toBe(
      403,
    );
  });

  it('gestora B não vê o razão nem os anexos da gestora A', async () => {
    const res = await t.http().get(`${base()}/periods`).set(auth(tokenB, gestoraB));
    expect(res.body).toEqual([]);
    const { rows } = await withContext(testPools().app, { gestoraId: gestoraB }, (c) =>
      c.query('SELECT count(*)::int AS n FROM journal_entry WHERE condominio_id = $1', [condo]),
    );
    expect(rows[0].n).toBe(0);
  });
});
