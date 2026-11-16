import { timingSafeEqual } from 'node:crypto';
import {
  toCentavos,
  toReais,
  type CreateChargeInput,
  type CreateSubaccountInput,
  type PayBillInput,
  type PayBillResult,
  type PaymentProvider,
  type ProviderAccount,
  type ProviderCharge,
  type ProviderChargeStatus,
  type StatementEntry,
  type SubaccountResult,
  type WebhookEvent,
} from './payment-provider';

type Fetch = typeof fetch;

interface AsaasPayment {
  id: string;
  status: string;
  value: number;
  netValue?: number;
  bankSlipUrl?: string | null;
  paymentDate?: string | null;
  clientPaymentDate?: string | null;
}

interface AsaasTransaction {
  id: string;
  value: number;
  date: string;
  type: string;
  description?: string;
  paymentId?: string | null;
  billId?: string | null;
}

const PAID = new Set(['RECEIVED', 'CONFIRMED', 'RECEIVED_IN_CASH']);
const CANCELLED = new Set(['REFUNDED', 'DELETED', 'CHARGEBACK_REQUESTED']);

const toStatus = (status: string): ProviderChargeStatus =>
  PAID.has(status) ? 'paga' : CANCELLED.has(status) ? 'cancelada' : 'pendente';

export class AsaasError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
  ) {
    super(`Asaas respondeu ${status}`);
  }
}

/**
 * Adaptador Asaas (API v3). Use só o sandbox fora de produção. A conta-mãe cria uma
 * subconta por condomínio; cada chamada da subconta usa a chave dela.
 */
export class AsaasPaymentProvider implements PaymentProvider {
  readonly name = 'asaas' as const;

  constructor(
    private readonly baseUrl: string,
    private readonly rootApiKey: string,
    private readonly http: Fetch = fetch,
  ) {}

  async createSubaccount(input: CreateSubaccountInput): Promise<SubaccountResult> {
    const result = await this.request<{ id: string; walletId: string; apiKey: string }>(
      this.rootApiKey,
      'POST',
      '/accounts',
      {
        name: input.nome,
        email: input.email,
        cpfCnpj: input.cnpj,
        companyType: 'ASSOCIATION',
        phone: input.telefone,
        mobilePhone: input.telefone,
        incomeValue: toReais(input.faturamentoMensalCentavos),
        address: input.endereco.logradouro,
        addressNumber: input.endereco.numero,
        complement: input.endereco.complemento,
        province: input.endereco.bairro,
        postalCode: input.endereco.cep,
        webhooks: [
          {
            name: 'gestao-condominial',
            url: input.webhookUrl,
            email: input.email,
            sendType: 'SEQUENTIALLY',
            interrupted: false,
            enabled: true,
            apiVersion: 3,
            authToken: input.webhookToken,
            events: [
              'PAYMENT_RECEIVED',
              'PAYMENT_CONFIRMED',
              'PAYMENT_DELETED',
              'PAYMENT_REFUNDED',
              'BILL_PAYMENT_DONE',
            ],
          },
        ],
      },
    );
    return { accountId: result.id, walletId: result.walletId, apiKey: result.apiKey };
  }

  async createCharge(account: ProviderAccount, input: CreateChargeInput): Promise<ProviderCharge> {
    const customer = await this.findOrCreateCustomer(account, input.pagador);
    // Boleto híbrido: o Asaas inclui o QR Pix no boleto.
    const payment = await this.request<AsaasPayment>(account.apiKey, 'POST', '/payments', {
      customer,
      billingType: 'BOLETO',
      value: toReais(input.valorCentavos),
      dueDate: input.vencimento,
      description: input.descricao,
      externalReference: input.externalReference,
      fine: { value: input.multaBp / 100, type: 'PERCENTAGE' },
      interest: { value: input.jurosMensalBp / 100 },
      ...(input.split
        ? {
            split: [
              { walletId: input.split.walletId, fixedValue: toReais(input.split.valorCentavos) },
            ],
          }
        : {}),
    });
    const [field, pix] = await Promise.all([
      this.request<{ identificationField: string }>(
        account.apiKey,
        'GET',
        `/payments/${payment.id}/identificationField`,
      ),
      this.request<{ payload: string }>(account.apiKey, 'GET', `/payments/${payment.id}/pixQrCode`),
    ]);
    return {
      id: payment.id,
      status: toStatus(payment.status),
      linhaDigitavel: field.identificationField,
      pixCopiaCola: pix.payload,
      boletoUrl: payment.bankSlipUrl ?? null,
    };
  }

  async findChargeByReference(
    account: ProviderAccount,
    externalReference: string,
  ): Promise<ProviderCharge | null> {
    const found = await this.request<{ data: AsaasPayment[] }>(
      account.apiKey,
      'GET',
      `/payments?externalReference=${encodeURIComponent(externalReference)}`,
    );
    const payment = found.data.find((p) => !CANCELLED.has(p.status));
    if (!payment) return null;
    const [field, pix] = await Promise.all([
      this.request<{ identificationField: string }>(
        account.apiKey,
        'GET',
        `/payments/${payment.id}/identificationField`,
      ),
      this.request<{ payload: string }>(account.apiKey, 'GET', `/payments/${payment.id}/pixQrCode`),
    ]);
    return {
      id: payment.id,
      status: toStatus(payment.status),
      linhaDigitavel: field.identificationField,
      pixCopiaCola: pix.payload,
      boletoUrl: payment.bankSlipUrl ?? null,
    };
  }

  async cancelCharge(account: ProviderAccount, providerChargeId: string): Promise<void> {
    await this.request(account.apiKey, 'DELETE', `/payments/${providerChargeId}`);
  }

  async getCharge(account: ProviderAccount, providerChargeId: string): Promise<ProviderCharge> {
    const payment = await this.request<AsaasPayment>(
      account.apiKey,
      'GET',
      `/payments/${providerChargeId}`,
    );
    return {
      id: payment.id,
      status: toStatus(payment.status),
      linhaDigitavel: null,
      pixCopiaCola: null,
      boletoUrl: payment.bankSlipUrl ?? null,
    };
  }

  /**
   * O extrato do Asaas traz o recebimento bruto e as tarifas em linhas separadas; aqui
   * elas são somadas por cobrança, para casar com o lançamento líquido da baixa.
   */
  async listStatement(
    account: ProviderAccount,
    from: string,
    to: string,
  ): Promise<StatementEntry[]> {
    const transactions: AsaasTransaction[] = [];
    for (let offset = 0; ; offset += 100) {
      const page = await this.request<{ data: AsaasTransaction[]; hasMore: boolean }>(
        account.apiKey,
        'GET',
        `/financialTransactions?startDate=${from}&finishDate=${to}&offset=${offset}&limit=100`,
      );
      transactions.push(...page.data);
      if (!page.hasMore) break;
    }

    const byPayment = new Map<string, StatementEntry>();
    const result: StatementEntry[] = [];
    for (const tx of transactions) {
      const valor = toCentavos(tx.value);
      if (tx.paymentId) {
        const current = byPayment.get(tx.paymentId);
        if (current) {
          current.valorCentavos += valor;
        } else {
          const entry: StatementEntry = {
            providerTxId: `pay_${tx.paymentId}`,
            data: tx.date,
            valorCentavos: valor,
            descricao: tx.description ?? tx.type,
            ref: { tipo: 'charge', id: tx.paymentId },
          };
          byPayment.set(tx.paymentId, entry);
          result.push(entry);
        }
      } else {
        result.push({
          providerTxId: tx.id,
          data: tx.date,
          valorCentavos: valor,
          descricao: tx.description ?? tx.type,
          ref: tx.billId ? { tipo: 'bill', id: tx.billId } : null,
        });
      }
    }
    return result;
  }

  async payBill(account: ProviderAccount, input: PayBillInput): Promise<PayBillResult> {
    if (!input.linhaDigitavel) {
      throw new Error('O Asaas paga contas pela linha digitável; cadastre-a na conta a pagar');
    }
    const bill = await this.request<{ id: string; status: string; paymentDate?: string | null }>(
      account.apiKey,
      'POST',
      '/bill',
      {
        identificationField: input.linhaDigitavel,
        scheduleDate: input.data,
        description: input.descricao,
        value: toReais(input.valorCentavos),
        externalReference: input.externalReference,
      },
    );
    return bill.status === 'PAID'
      ? { id: bill.id, status: 'pago', pagoEm: bill.paymentDate ?? input.data }
      : { id: bill.id, status: 'agendado', pagoEm: null };
  }

  verifyWebhook(account: ProviderAccount, headers: Record<string, unknown>): boolean {
    const received = headers['asaas-access-token'];
    if (typeof received !== 'string') return false;
    const a = Buffer.from(received);
    const b = Buffer.from(account.webhookToken);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  parseWebhook(body: unknown): WebhookEvent {
    const b = body as {
      id: string;
      event: string;
      payment?: AsaasPayment;
      bill?: { id: string; paymentDate?: string | null; scheduleDate?: string };
    };
    if ((b.event === 'PAYMENT_RECEIVED' || b.event === 'PAYMENT_CONFIRMED') && b.payment) {
      return {
        tipo: 'charge_paid',
        eventId: b.id,
        providerChargeId: b.payment.id,
        valorPagoCentavos: toCentavos(b.payment.value),
        valorLiquidoCentavos: toCentavos(b.payment.netValue ?? b.payment.value),
        pagoEm: b.payment.clientPaymentDate ?? b.payment.paymentDate ?? '',
      };
    }
    if ((b.event === 'PAYMENT_DELETED' || b.event === 'PAYMENT_REFUNDED') && b.payment) {
      return { tipo: 'charge_cancelled', eventId: b.id, providerChargeId: b.payment.id };
    }
    if (b.event === 'BILL_PAYMENT_DONE' && b.bill) {
      return {
        tipo: 'bill_paid',
        eventId: b.id,
        providerBillId: b.bill.id,
        pagoEm: b.bill.paymentDate ?? b.bill.scheduleDate ?? '',
      };
    }
    return { tipo: 'ignorado', eventId: String(b.id), original: String(b.event) };
  }

  private async findOrCreateCustomer(
    account: ProviderAccount,
    pagador: CreateChargeInput['pagador'],
  ): Promise<string> {
    const found = await this.request<{ data: { id: string }[] }>(
      account.apiKey,
      'GET',
      `/customers?cpfCnpj=${encodeURIComponent(pagador.documento)}`,
    );
    const existing = found.data[0];
    if (existing) return existing.id;
    const created = await this.request<{ id: string }>(account.apiKey, 'POST', '/customers', {
      name: pagador.nome,
      cpfCnpj: pagador.documento,
      email: pagador.email ?? undefined,
      notificationDisabled: true,
    });
    return created.id;
  }

  private async request<T>(
    apiKey: string,
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> {
    const response = await this.http(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        access_token: apiKey,
        'user-agent': 'gestao-condominial',
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    if (!response.ok) throw new AsaasError(response.status, text.slice(0, 500));
    return (text ? JSON.parse(text) : {}) as T;
  }
}
