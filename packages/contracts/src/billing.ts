import { z } from 'zod';
import { centavosSchema, isoDateSchema, monthSchema } from './ledger';
import { enderecoSchema } from './org';

// ---------------------------------------------------------------------------
// Conta do condomínio no broker
// ---------------------------------------------------------------------------

export const activatePaymentAccountRequestSchema = z.object({
  email: z.email().transform((v) => v.toLowerCase()),
  telefone: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .pipe(z.string().min(10).max(11)),
  endereco: enderecoSchema,
  /** Arrecadação mensal estimada (exigida pelo broker na abertura da subconta). */
  faturamentoMensalCentavos: centavosSchema.positive(),
});
export type ActivatePaymentAccountRequest = z.infer<typeof activatePaymentAccountRequestSchema>;

export interface PaymentAccountDto {
  provider: string;
  providerAccountId: string;
  walletId: string | null;
  /** Caminho do webhook a cadastrar no broker (o token vai cifrado no banco). */
  webhookPath: string;
}

// ---------------------------------------------------------------------------
// Orçamento e rateio
// ---------------------------------------------------------------------------

export const RATEIO_CRITERIOS = ['fracao_ideal', 'igualitario'] as const;
export type RateioCriterio = (typeof RATEIO_CRITERIOS)[number];

export const budgetLineInputSchema = z.object({
  accountId: z.uuid(),
  valorMensalCentavos: centavosSchema.positive(),
  criterio: z.enum(RATEIO_CRITERIOS),
});

export const createBudgetRequestSchema = z.object({
  ano: z.number().int().min(2000).max(2100),
  linhas: z
    .array(budgetLineInputSchema)
    .min(1)
    .max(200)
    .refine((ls) => new Set(ls.map((l) => l.accountId)).size === ls.length, {
      message: 'Cada conta aparece uma vez no orçamento',
    }),
});
export type CreateBudgetRequest = z.infer<typeof createBudgetRequestSchema>;

export interface BudgetDto {
  id: string;
  ano: number;
  status: 'rascunho' | 'aprovado';
  totalMensalCentavos: number;
  linhas: {
    accountId: string;
    codigo: string;
    conta: string;
    valorMensalCentavos: number;
    criterio: RateioCriterio;
  }[];
}

export const rateioRequestSchema = z.object({
  competencia: monthSchema,
  /** Padrão: dia de vencimento da configuração, no mês da competência. */
  vencimento: isoDateSchema.optional(),
});
export type RateioRequest = z.infer<typeof rateioRequestSchema>;

export interface RateioUnidadeDto {
  unitId: string;
  unidade: string;
  taxaCentavos: number;
  fundoReservaCentavos: number;
  totalCentavos: number;
  pagador: string | null;
}

export interface RateioPreviewDto {
  competencia: string;
  vencimento: string;
  totalCentavos: number;
  unidades: RateioUnidadeDto[];
  /** Problemas que impedem a emissão (ex.: unidade sem fração ideal ou sem pagador). */
  pendencias: string[];
}

// ---------------------------------------------------------------------------
// Cobranças
// ---------------------------------------------------------------------------

export type ChargeStatus = 'pendente_emissao' | 'emitida' | 'erro_emissao' | 'paga' | 'cancelada';

export interface ChargeDto {
  id: string;
  unitId: string;
  unidade: string;
  competencia: string;
  vencimento: string;
  valorCentavos: number;
  status: ChargeStatus;
  linhaDigitavel: string | null;
  pixCopiaCola: string | null;
  boletoUrl: string | null;
  pagoEm: string | null;
  valorPagoCentavos: number | null;
  erroEmissao: string | null;
  itens: { descricao: string; valorCentavos: number }[];
}

/** Cobrança como o morador vê: linguagem do dia a dia e valor já com encargos. */
export interface MyChargeDto extends ChargeDto {
  /** "Sua taxa de outubro". */
  titulo: string;
  atrasada: boolean;
  diasAtraso: number;
  /** Dias até o vencimento (0 = vence hoje; negativo quando já venceu). */
  diasParaVencer: number;
  valorAtualizadoCentavos: number;
}

/** Inadimplência nominal: só gestora, síndico e conselho (§3.9). */
export interface InadimplenciaDto {
  chargeId: string;
  unitId: string;
  unidade: string;
  pagador: string | null;
  competencia: string;
  vencimento: string;
  valorCentavos: number;
  valorAtualizadoCentavos: number;
  diasAtraso: number;
}

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/** '2026-10' ou '2026-10-01' → 'outubro'. */
export function nomeDoMes(competencia: string): string {
  return MESES[Number(competencia.slice(5, 7)) - 1] ?? competencia;
}

const DAY_MS = 86_400_000;

/** Dias corridos entre duas datas ISO (AAAA-MM-DD), sem fuso. */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}

/**
 * Valor atualizado de uma cobrança vencida: multa única + juros simples pro rata die
 * (taxa mensal / 30 por dia), como o boleto calcula. Centavos inteiros, arredondamento
 * comercial. Até o vencimento, devolve o valor original.
 */
export function valorAtualizado(input: {
  valorCentavos: number;
  vencimento: string;
  hoje: string;
  multaBp: number;
  jurosMensalBp: number;
}): { multaCentavos: number; jurosCentavos: number; totalCentavos: number; diasAtraso: number } {
  const diasAtraso = Math.max(0, daysBetween(input.vencimento, input.hoje));
  if (diasAtraso === 0) {
    return { multaCentavos: 0, jurosCentavos: 0, totalCentavos: input.valorCentavos, diasAtraso };
  }
  const multaCentavos = Math.round((input.valorCentavos * input.multaBp) / 10_000);
  const jurosCentavos = Math.round(
    (input.valorCentavos * input.jurosMensalBp * diasAtraso) / (10_000 * 30),
  );
  return {
    multaCentavos,
    jurosCentavos,
    totalCentavos: input.valorCentavos + multaCentavos + jurosCentavos,
    diasAtraso,
  };
}

// ---------------------------------------------------------------------------
// Contas a pagar
// ---------------------------------------------------------------------------

export const createPayableRequestSchema = z.object({
  fornecedor: z.string().trim().min(2).max(200),
  fornecedorDocumento: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .pipe(z.string().regex(/^(\d{11}|\d{14})$/, 'CPF ou CNPJ'))
    .optional(),
  descricao: z.string().trim().min(3).max(500),
  accountId: z.uuid(),
  valorCentavos: centavosSchema.positive(),
  vencimento: isoDateSchema,
  linhaDigitavel: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .pipe(z.string().regex(/^\d{44,48}$/, 'Linha digitável com 44 a 48 dígitos'))
    .optional(),
  /** Nota fiscal ou boleto da conta (regra §3.5: sem comprovante, sem despesa). */
  comprovanteId: z.uuid(),
});
export type CreatePayableRequest = z.infer<typeof createPayableRequestSchema>;

export const rejectPayableRequestSchema = z.object({
  motivo: z.string().trim().min(5).max(500),
});
export type RejectPayableRequest = z.infer<typeof rejectPayableRequestSchema>;

export type PayableStatus =
  | 'aguardando_aprovacao'
  | 'aguardando_segunda_aprovacao'
  | 'aprovada'
  | 'pagamento_solicitado'
  | 'paga'
  | 'rejeitada';

export interface PayableDto {
  id: string;
  fornecedor: string;
  descricao: string;
  accountId: string;
  valorCentavos: number;
  vencimento: string;
  status: PayableStatus;
  requerSegundaAprovacao: boolean;
  comprovanteId: string;
  aprovadoEm: string | null;
  segundaAprovacaoEm: string | null;
  motivoRejeicao: string | null;
  pagoEm: string | null;
}

// ---------------------------------------------------------------------------
// Conciliação
// ---------------------------------------------------------------------------

export interface StatementLineDto {
  id: string;
  data: string;
  valorCentavos: number;
  descricao: string;
  status: 'conciliada' | 'excecao' | 'resolvida';
  matchEntryId: string | null;
  motivo: string | null;
  notaResolucao: string | null;
}

export const resolveExceptionRequestSchema = z
  .object({
    /** vincular: casa com um lançamento existente; justificar: aceita a diferença com nota. */
    acao: z.enum(['vincular', 'justificar']),
    entryId: z.uuid().optional(),
    nota: z.string().trim().min(5).max(500),
  })
  .refine((v) => v.acao !== 'vincular' || v.entryId !== undefined, {
    message: 'Informe o lançamento a vincular',
    path: ['entryId'],
  });
export type ResolveExceptionRequest = z.infer<typeof resolveExceptionRequestSchema>;

export interface ReconciliationResultDto {
  importadas: number;
  conciliadas: number;
  excecoes: number;
}
