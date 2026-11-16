import { describe, expect, it } from 'vitest';
import { AsaasError, AsaasPaymentProvider } from './asaas.provider';
import type { ProviderAccount } from './payment-provider';

/** fetch falso: responde por "MÉTODO caminho" e grava as chamadas. */
function fakeFetch(routes: Record<string, unknown>, status = 200) {
  const calls: { method: string; url: string; body: unknown; headers: Record<string, string> }[] =
    [];
  const fn = (url: string | URL | Request, init?: RequestInit) => {
    const u = String(url);
    const path = u.replace('https://sandbox.test/v3', '').split('?')[0] ?? '';
    const method = init?.method ?? 'GET';
    calls.push({
      method,
      url: u,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      headers: init?.headers as Record<string, string>,
    });
    const payload = routes[`${method} ${path}`];
    return Promise.resolve(
      new Response(payload === undefined ? 'not found' : JSON.stringify(payload), {
        status: payload === undefined ? 404 : status,
      }),
    );
  };
  return { fn: fn as typeof fetch, calls };
}

const account: ProviderAccount = {
  accountId: 'acc_1',
  walletId: 'wal_1',
  apiKey: 'sub-key',
  webhookToken: 'tok-123',
};

describe('AsaasPaymentProvider', () => {
  it('cria cobrança com boleto híbrido, encargos e split, usando a chave da subconta', async () => {
    const { fn, calls } = fakeFetch({
      'GET /customers': { data: [] },
      'POST /customers': { id: 'cus_1' },
      'POST /payments': { id: 'pay_1', status: 'PENDING', value: 550, bankSlipUrl: 'https://b' },
      'GET /payments/pay_1/identificationField': { identificationField: '2379000' },
      'GET /payments/pay_1/pixQrCode': { payload: '000201pix' },
    });
    const provider = new AsaasPaymentProvider('https://sandbox.test/v3', 'root-key', fn);
    const charge = await provider.createCharge(account, {
      externalReference: 'charge-uuid',
      pagador: { nome: 'Maria', documento: '52998224725', email: 'm@x.local' },
      valorCentavos: 55_000,
      vencimento: '2026-11-10',
      descricao: 'Taxa de novembro',
      multaBp: 200,
      jurosMensalBp: 100,
      split: { walletId: 'wal_plat', valorCentavos: 150 },
    });
    expect(charge).toEqual({
      id: 'pay_1',
      status: 'pendente',
      linhaDigitavel: '2379000',
      pixCopiaCola: '000201pix',
      boletoUrl: 'https://b',
    });
    const payment = calls.find((c) => c.method === 'POST' && c.url.endsWith('/payments'));
    expect(payment?.headers.access_token).toBe('sub-key');
    expect(payment?.body).toMatchObject({
      customer: 'cus_1',
      billingType: 'BOLETO',
      value: 550,
      fine: { value: 2, type: 'PERCENTAGE' },
      interest: { value: 1 },
      split: [{ walletId: 'wal_plat', fixedValue: 1.5 }],
      externalReference: 'charge-uuid',
    });
  });

  it('extrato: soma recebimento e tarifas da mesma cobrança numa linha líquida', async () => {
    const { fn } = fakeFetch({
      'GET /financialTransactions': {
        hasMore: false,
        data: [
          {
            id: 'ft1',
            value: 550,
            date: '2026-11-10',
            type: 'PAYMENT_RECEIVED',
            paymentId: 'pay_1',
          },
          { id: 'ft2', value: -1.99, date: '2026-11-10', type: 'PAYMENT_FEE', paymentId: 'pay_1' },
          { id: 'ft3', value: -1.5, date: '2026-11-10', type: 'TRANSFER', paymentId: 'pay_1' },
          { id: 'ft4', value: -300, date: '2026-11-11', type: 'BILL_PAYMENT', billId: 'bill_9' },
        ],
      },
    });
    const provider = new AsaasPaymentProvider('https://sandbox.test/v3', 'root-key', fn);
    expect(await provider.listStatement(account, '2026-11-01', '2026-11-30')).toEqual([
      {
        providerTxId: 'pay_pay_1',
        data: '2026-11-10',
        valorCentavos: 54_651,
        descricao: 'PAYMENT_RECEIVED',
        ref: { tipo: 'charge', id: 'pay_1' },
      },
      {
        providerTxId: 'ft4',
        data: '2026-11-11',
        valorCentavos: -30_000,
        descricao: 'BILL_PAYMENT',
        ref: { tipo: 'bill', id: 'bill_9' },
      },
    ]);
  });

  it('webhook: confere o token em tempo constante e normaliza o evento de pagamento', () => {
    const provider = new AsaasPaymentProvider(
      'https://sandbox.test/v3',
      'root-key',
      fakeFetch({}).fn,
    );
    expect(provider.verifyWebhook(account, { 'asaas-access-token': 'tok-123' })).toBe(true);
    expect(provider.verifyWebhook(account, { 'asaas-access-token': 'tok-12' })).toBe(false);
    expect(provider.verifyWebhook(account, {})).toBe(false);
    expect(
      provider.parseWebhook({
        id: 'evt_1',
        event: 'PAYMENT_RECEIVED',
        payment: {
          id: 'pay_1',
          status: 'RECEIVED',
          value: 561.25,
          netValue: 557.76,
          clientPaymentDate: '2026-11-25',
        },
      }),
    ).toEqual({
      tipo: 'charge_paid',
      eventId: 'evt_1',
      providerChargeId: 'pay_1',
      valorPagoCentavos: 56_125,
      valorLiquidoCentavos: 55_776,
      pagoEm: '2026-11-25',
    });
    expect(provider.parseWebhook({ id: 'evt_2', event: 'PAYMENT_CREATED' })).toEqual({
      tipo: 'ignorado',
      eventId: 'evt_2',
      original: 'PAYMENT_CREATED',
    });
  });

  it('erro HTTP vira AsaasError com o status', async () => {
    const provider = new AsaasPaymentProvider(
      'https://sandbox.test/v3',
      'root-key',
      fakeFetch({}).fn,
    );
    await expect(provider.getCharge(account, 'pay_x')).rejects.toBeInstanceOf(AsaasError);
  });
});
