import type { Endereco } from '@condo/contracts';

/**
 * Porta do broker de pagamento (§5). O dinheiro do condomínio entra sempre na subconta
 * dele; a plataforma recebe só a tarifa, por split. Valores sempre em centavos.
 */
export interface PaymentProvider {
  readonly name: 'fake' | 'asaas';
  createSubaccount(input: CreateSubaccountInput): Promise<SubaccountResult>;
  createCharge(account: ProviderAccount, input: CreateChargeInput): Promise<ProviderCharge>;
  /**
   * Cobrança já criada com esta referência (nosso id). Evita duplicar boleto quando a
   * emissão é reprocessada depois de uma falha entre o broker e o nosso banco.
   */
  findChargeByReference(
    account: ProviderAccount,
    externalReference: string,
  ): Promise<ProviderCharge | null>;
  cancelCharge(account: ProviderAccount, providerChargeId: string): Promise<void>;
  getCharge(account: ProviderAccount, providerChargeId: string): Promise<ProviderCharge>;
  /** Extrato da subconta entre duas datas (inclusive), já normalizado por operação. */
  listStatement(account: ProviderAccount, from: string, to: string): Promise<StatementEntry[]>;
  payBill(account: ProviderAccount, input: PayBillInput): Promise<PayBillResult>;
  /** Confere a autenticidade do webhook (token configurado na subconta). */
  verifyWebhook(account: ProviderAccount, headers: Record<string, unknown>): boolean;
  parseWebhook(body: unknown): WebhookEvent;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');

/** Credenciais da subconta, já decifradas (só em memória, nunca em log). */
export interface ProviderAccount {
  accountId: string;
  walletId: string | null;
  apiKey: string;
  webhookToken: string;
}

export interface CreateSubaccountInput {
  nome: string;
  cnpj: string;
  email: string;
  telefone: string;
  endereco: Endereco;
  faturamentoMensalCentavos: number;
  webhookUrl: string;
  webhookToken: string;
}

export interface SubaccountResult {
  accountId: string;
  walletId: string | null;
  apiKey: string;
}

export interface CreateChargeInput {
  /** Id da cobrança no nosso sistema (volta nos webhooks e no extrato). */
  externalReference: string;
  pagador: { nome: string; documento: string; email: string | null };
  valorCentavos: number;
  vencimento: string;
  descricao: string;
  multaBp: number;
  jurosMensalBp: number;
  /** Tarifa da plataforma (split). */
  split: { walletId: string; valorCentavos: number } | null;
}

export type ProviderChargeStatus = 'pendente' | 'paga' | 'cancelada';

export interface ProviderCharge {
  id: string;
  status: ProviderChargeStatus;
  linhaDigitavel: string | null;
  pixCopiaCola: string | null;
  boletoUrl: string | null;
}

export interface StatementEntry {
  providerTxId: string;
  data: string;
  /** Líquido e com sinal: entrada > 0, saída < 0. */
  valorCentavos: number;
  descricao: string;
  ref: { tipo: 'charge' | 'bill'; id: string } | null;
}

export interface PayBillInput {
  externalReference: string;
  linhaDigitavel: string | null;
  valorCentavos: number;
  data: string;
  descricao: string;
}

export interface PayBillResult {
  id: string;
  /** 'pago' quando o broker confirma na hora; senão chega webhook 'bill_paid' depois. */
  status: 'agendado' | 'pago';
  pagoEm: string | null;
}

export type WebhookEvent =
  | {
      tipo: 'charge_paid';
      eventId: string;
      providerChargeId: string;
      valorPagoCentavos: number;
      /** Valor que entrou na subconta (já sem a tarifa do broker e o split). */
      valorLiquidoCentavos: number;
      pagoEm: string;
    }
  | { tipo: 'charge_cancelled'; eventId: string; providerChargeId: string }
  | { tipo: 'bill_paid'; eventId: string; providerBillId: string; pagoEm: string }
  | { tipo: 'ignorado'; eventId: string; original: string };

export const toReais = (centavos: number): number => Number((centavos / 100).toFixed(2));
export const toCentavos = (reais: number): number => Math.round(reais * 100);
