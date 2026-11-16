import { randomUUID, timingSafeEqual } from 'node:crypto';
import { randomToken } from '../../../common/crypto';
import type {
  CreateChargeInput,
  CreateSubaccountInput,
  PayBillInput,
  PayBillResult,
  PaymentProvider,
  ProviderAccount,
  ProviderCharge,
  StatementEntry,
  SubaccountResult,
  WebhookEvent,
} from './payment-provider';

/** Tarifa simulada do broker por cobrança paga. */
export const FAKE_BROKER_FEE_CENTAVOS = 199;

interface FakeCharge extends ProviderCharge {
  accountId: string;
  input: CreateChargeInput;
}

interface FakeWebhookBody {
  id: string;
  event: 'CHARGE_PAID' | 'CHARGE_CANCELLED' | 'BILL_PAID';
  charge?: { id: string; value: number; netValue: number; paidAt: string };
  bill?: { id: string; paidAt: string };
}

export interface FakeWebhookDelivery {
  headers: Record<string, string>;
  body: FakeWebhookBody;
}

const WEBHOOK_HEADER = 'x-fake-webhook-token';

/**
 * Broker simulado para dev e testes: guarda estado em memória e gera os webhooks que o
 * broker real mandaria (inclusive para simular reenvio). Proibido em produção (env).
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly name = 'fake' as const;
  private readonly accounts = new Map<string, { statement: StatementEntry[] }>();
  private readonly charges = new Map<string, FakeCharge>();

  createSubaccount(_input: CreateSubaccountInput): Promise<SubaccountResult> {
    const accountId = `fake_acc_${randomUUID()}`;
    this.state(accountId);
    return Promise.resolve({
      accountId,
      walletId: `fake_wallet_${randomUUID()}`,
      apiKey: randomToken(),
    });
  }

  createCharge(account: ProviderAccount, input: CreateChargeInput): Promise<ProviderCharge> {
    const id = `fake_pay_${randomUUID()}`;
    const digits = id.replace(/\D/g, '').padEnd(47, '0').slice(0, 47);
    const charge: FakeCharge = {
      id,
      accountId: account.accountId,
      input,
      status: 'pendente',
      linhaDigitavel: digits,
      pixCopiaCola: `00020126580014BR.GOV.BCB.PIX0136${id}5204000053039865802BR6304FAKE`,
      boletoUrl: `https://fake-broker.local/boleto/${id}`,
    };
    this.charges.set(id, charge);
    return Promise.resolve(this.publicView(charge));
  }

  findChargeByReference(
    account: ProviderAccount,
    externalReference: string,
  ): Promise<ProviderCharge | null> {
    const found = [...this.charges.values()].find(
      (c) => c.accountId === account.accountId && c.input.externalReference === externalReference,
    );
    return Promise.resolve(found ? this.publicView(found) : null);
  }

  cancelCharge(_account: ProviderAccount, providerChargeId: string): Promise<void> {
    const charge = this.charges.get(providerChargeId);
    if (charge && charge.status === 'pendente') charge.status = 'cancelada';
    return Promise.resolve();
  }

  getCharge(_account: ProviderAccount, providerChargeId: string): Promise<ProviderCharge> {
    const charge = this.charges.get(providerChargeId);
    if (!charge) return Promise.reject(new Error(`Cobrança fake inexistente: ${providerChargeId}`));
    return Promise.resolve(this.publicView(charge));
  }

  listStatement(account: ProviderAccount, from: string, to: string): Promise<StatementEntry[]> {
    const state = this.accounts.get(account.accountId);
    return Promise.resolve((state?.statement ?? []).filter((l) => l.data >= from && l.data <= to));
  }

  payBill(account: ProviderAccount, input: PayBillInput): Promise<PayBillResult> {
    const id = `fake_bill_${randomUUID()}`;
    this.state(account.accountId).statement.push({
      providerTxId: `tx_${id}`,
      data: input.data,
      valorCentavos: -input.valorCentavos,
      descricao: `Pagamento de conta: ${input.descricao}`,
      ref: { tipo: 'bill', id },
    });
    return Promise.resolve({ id, status: 'pago', pagoEm: input.data });
  }

  verifyWebhook(account: ProviderAccount, headers: Record<string, unknown>): boolean {
    const received = headers[WEBHOOK_HEADER];
    if (typeof received !== 'string') return false;
    const a = Buffer.from(received);
    const b = Buffer.from(account.webhookToken);
    return a.length === b.length && timingSafeEqual(a, b);
  }

  parseWebhook(body: unknown): WebhookEvent {
    const b = body as FakeWebhookBody;
    if (b.event === 'CHARGE_PAID' && b.charge) {
      return {
        tipo: 'charge_paid',
        eventId: b.id,
        providerChargeId: b.charge.id,
        valorPagoCentavos: b.charge.value,
        valorLiquidoCentavos: b.charge.netValue,
        pagoEm: b.charge.paidAt,
      };
    }
    if (b.event === 'CHARGE_CANCELLED' && b.charge) {
      return { tipo: 'charge_cancelled', eventId: b.id, providerChargeId: b.charge.id };
    }
    if (b.event === 'BILL_PAID' && b.bill) {
      return { tipo: 'bill_paid', eventId: b.id, providerBillId: b.bill.id, pagoEm: b.bill.paidAt };
    }
    return { tipo: 'ignorado', eventId: String(b.id), original: String(b.event) };
  }

  // -------------------------------------------------------------------------
  // Simulação (só existe no fake)
  // -------------------------------------------------------------------------

  /**
   * Simula o pagamento pelo morador: lança no extrato da subconta o valor líquido (menos
   * tarifa do broker e split) e devolve o webhook a entregar. Os dados vêm do nosso banco,
   * então a simulação funciona mesmo depois de reiniciar o processo.
   */
  simulatePayment(input: {
    account: ProviderAccount;
    providerChargeId: string;
    valorPagoCentavos: number;
    splitCentavos: number;
    descricao: string;
    pagoEm: string;
  }): FakeWebhookDelivery {
    const net = input.valorPagoCentavos - FAKE_BROKER_FEE_CENTAVOS - input.splitCentavos;
    const statement = this.state(input.account.accountId).statement;
    const txId = `tx_${input.providerChargeId}`;
    if (!statement.some((l) => l.providerTxId === txId)) {
      statement.push({
        providerTxId: txId,
        data: input.pagoEm,
        valorCentavos: net,
        descricao: `Recebimento ${input.descricao}`,
        ref: { tipo: 'charge', id: input.providerChargeId },
      });
    }
    const charge = this.charges.get(input.providerChargeId);
    if (charge) charge.status = 'paga';
    return {
      headers: { [WEBHOOK_HEADER]: input.account.webhookToken },
      body: {
        id: `evt_${input.providerChargeId}_paid`,
        event: 'CHARGE_PAID',
        charge: {
          id: input.providerChargeId,
          value: input.valorPagoCentavos,
          netValue: net,
          paidAt: input.pagoEm,
        },
      },
    };
  }

  /** Lança no extrato uma movimentação avulsa (ex.: tarifa não esperada) para testar exceções. */
  addStatementEntry(accountId: string, entry: Omit<StatementEntry, 'providerTxId'>): void {
    this.state(accountId).statement.push({ ...entry, providerTxId: `tx_${randomUUID()}` });
  }

  private state(accountId: string): { statement: StatementEntry[] } {
    let state = this.accounts.get(accountId);
    if (!state) {
      state = { statement: [] };
      this.accounts.set(accountId, state);
    }
    return state;
  }

  private publicView(charge: FakeCharge): ProviderCharge {
    return {
      id: charge.id,
      status: charge.status,
      linhaDigitavel: charge.linhaDigitavel,
      pixCopiaCola: charge.pixCopiaCola,
      boletoUrl: charge.boletoUrl,
    };
  }
}
