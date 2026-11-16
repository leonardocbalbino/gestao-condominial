import { z } from 'zod';

/** Dinheiro sempre em centavos inteiros (regra §3.1). Nunca float. */
export const centavosSchema = z.number().int().safe();

/** Data de calendário ISO (AAAA-MM-DD), sem fuso. */
export const isoDateSchema = z.iso.date();

/** Mês contábil no formato AAAA-MM. */
export const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use o formato AAAA-MM');

export type AccountNatureza = 'ativo' | 'passivo' | 'patrimonio' | 'receita' | 'despesa';
export type AccountGrupo = 'ordinaria' | 'fundo_reserva' | 'obras';

export interface AccountDto {
  id: string;
  codigo: string;
  nome: string;
  natureza: AccountNatureza;
  grupo: AccountGrupo | null;
  analitica: boolean;
  caixa: boolean;
  papelSistema: string | null;
  ativa: boolean;
}

export const createAccountRequestSchema = z
  .object({
    codigo: z.string().regex(/^\d+(\.\d+)*$/, 'Use números separados por ponto (ex.: 4.3.06)'),
    nome: z.string().trim().min(2).max(120),
    natureza: z.enum(['ativo', 'passivo', 'patrimonio', 'receita', 'despesa']),
    grupo: z.enum(['ordinaria', 'fundo_reserva', 'obras']).optional(),
    analitica: z.boolean().default(true),
  })
  .refine((v) => ['receita', 'despesa'].includes(v.natureza) === (v.grupo !== undefined), {
    message: 'Receitas e despesas precisam de grupo; as demais contas não têm grupo',
    path: ['grupo'],
  });
export type CreateAccountRequest = z.infer<typeof createAccountRequestSchema>;

/** Inicia a contabilidade do condomínio: copia o plano da gestora e abre o primeiro mês. */
export const setupLedgerRequestSchema = z.object({
  mesInicial: monthSchema,
  /** Saldo do banco no início (centavos); lançado contra "saldos iniciais". */
  saldoInicialCentavos: centavosSchema.nonnegative().default(0),
});
export type SetupLedgerRequest = z.infer<typeof setupLedgerRequestSchema>;

export type PeriodStatus = 'aberto' | 'em_revisao' | 'aprovado' | 'publicado';

export interface PeriodDto {
  id: string;
  mes: string;
  status: PeriodStatus;
  hash: string | null;
  fechadoEm: string | null;
}

export const journalLineInputSchema = z.object({
  accountId: z.uuid(),
  /** > 0 débito, < 0 crédito. */
  valorCentavos: centavosSchema.refine((v) => v !== 0, 'Valor não pode ser zero'),
});

export const createEntryRequestSchema = z
  .object({
    dataCompetencia: isoDateSchema,
    dataCaixa: isoDateSchema,
    historico: z.string().trim().min(3).max(500),
    comprovanteId: z.uuid().optional(),
    linhas: z.array(journalLineInputSchema).min(2).max(50),
  })
  .refine((v) => v.linhas.reduce((acc, l) => acc + l.valorCentavos, 0) === 0, {
    message: 'Débitos e créditos precisam somar zero',
    path: ['linhas'],
  });
export type CreateEntryRequest = z.infer<typeof createEntryRequestSchema>;

export const reverseEntryRequestSchema = z.object({
  motivo: z.string().trim().min(5).max(500),
});
export type ReverseEntryRequest = z.infer<typeof reverseEntryRequestSchema>;

export interface JournalLineDto {
  accountId: string;
  codigo: string;
  conta: string;
  valorCentavos: number;
}

export interface JournalEntryDto {
  id: string;
  periodId: string;
  dataCompetencia: string;
  dataCaixa: string;
  historico: string;
  origem: string;
  origemRef: string | null;
  estornoDe: string | null;
  estornadoPor: string | null;
  motivoEstorno: string | null;
  comprovanteId: string | null;
  linhas: JournalLineDto[];
}

export interface BalanceteLinha {
  accountId: string;
  codigo: string;
  nome: string;
  natureza: AccountNatureza;
  grupo: AccountGrupo | null;
  saldoAnteriorCentavos: number;
  debitosCentavos: number;
  creditosCentavos: number;
  saldoFinalCentavos: number;
}

/**
 * Balancete do mês (regime de caixa). Saldos com sinal contábil: débito positivo.
 * Receitas aparecem negativas no razão; os totais abaixo vêm em valor absoluto.
 */
export interface BalanceteDto {
  period: PeriodDto;
  linhas: BalanceteLinha[];
  totais: {
    receitasCentavos: number;
    despesasCentavos: number;
    resultadoCentavos: number;
    /** Saldo das contas de caixa/banco no fim do mês. */
    caixaFinalCentavos: number;
    /** Resultado acumulado por fundo (receitas − despesas do grupo). */
    fundos: Record<AccountGrupo, number>;
  };
}

export interface AttachmentDto {
  id: string;
  nomeArquivo: string;
  contentType: string;
  tamanho: number;
  sha256: string;
  createdAt: string;
}
