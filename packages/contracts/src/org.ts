import { z } from 'zod';
import { isValidCnpj, normalizeDocument } from './documents';

export const cnpjSchema = z
  .string()
  .refine(isValidCnpj, 'CNPJ inválido')
  .transform(normalizeDocument);

export const brandingSchema = z.object({
  primaryColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  logoUrl: z.url().optional(),
  domain: z.string().min(3).max(253).optional(),
});
export type Branding = z.infer<typeof brandingSchema>;

export const createGestoraRequestSchema = z.object({
  nome: z.string().trim().min(2).max(200),
  cnpj: cnpjSchema,
  branding: brandingSchema.default({}),
  admin: z.object({
    nome: z.string().trim().min(2).max(200),
    email: z.email().transform((v) => v.toLowerCase()),
  }),
});
export type CreateGestoraRequest = z.infer<typeof createGestoraRequestSchema>;

export interface GestoraDto {
  id: string;
  nome: string;
  cnpj: string;
  branding: Branding;
}

export const createCondominioRequestSchema = z.object({
  nome: z.string().trim().min(2).max(200),
  cnpj: cnpjSchema,
});
export type CreateCondominioRequest = z.infer<typeof createCondominioRequestSchema>;

export interface CondominioDto {
  id: string;
  gestoraId: string;
  nome: string;
  cnpj: string;
}

/** Percentuais em pontos-base (1% = 100): inteiros, sem float. */
const bp = z.number().int().min(0);

/**
 * Encargos de atraso limitados pelo Código Civil, art. 1.336, §1º: multa de até 2%;
 * juros de 1% ao mês, salvo outra taxa na convenção.
 */
const cobrancaFields = {
  diaVencimento: z.number().int().min(1).max(28),
  multaBp: bp.max(200, 'Multa limitada a 2% (Código Civil, art. 1.336, §1º)'),
  jurosMensalBp: bp.max(1000),
  fundoReservaBp: bp.max(5000),
};
const pagamentosFields = {
  /** Acima deste valor, a conta a pagar exige segunda assinatura (conselheiro). */
  limiteSegundaAprovacaoCentavos: z.number().int().min(0),
};

export const DEFAULT_CONDOMINIO_CONFIG = {
  cobranca: { diaVencimento: 10, multaBp: 200, jurosMensalBp: 100, fundoReservaBp: 1000 },
  pagamentos: { limiteSegundaAprovacaoCentavos: 500_000 },
};

/** Configuração completa (convenção). Valores ausentes no banco vêm do padrão. */
export const condominioConfigSchema = z.object({
  cobranca: z.object(cobrancaFields),
  pagamentos: z.object(pagamentosFields),
});
export type CondominioConfig = z.infer<typeof condominioConfigSchema>;

/** Atualização parcial: só os campos enviados mudam. */
export const updateCondominioConfigRequestSchema = z.object({
  cobranca: z.object(cobrancaFields).partial().optional(),
  pagamentos: z.object(pagamentosFields).partial().optional(),
});
export type UpdateCondominioConfigRequest = z.infer<typeof updateCondominioConfigRequestSchema>;

/** Mescla a configuração gravada com o padrão (campos novos ganham o valor padrão). */
export function resolveCondominioConfig(stored: unknown): CondominioConfig {
  const s = (stored ?? {}) as Partial<Record<keyof CondominioConfig, object>>;
  return condominioConfigSchema.parse({
    cobranca: { ...DEFAULT_CONDOMINIO_CONFIG.cobranca, ...s.cobranca },
    pagamentos: { ...DEFAULT_CONDOMINIO_CONFIG.pagamentos, ...s.pagamentos },
  });
}

export const enderecoSchema = z.object({
  cep: z
    .string()
    .transform((v) => v.replace(/\D/g, ''))
    .pipe(z.string().length(8, 'CEP com 8 dígitos')),
  logradouro: z.string().trim().min(2).max(200),
  numero: z.string().trim().min(1).max(20),
  complemento: z.string().trim().max(100).optional(),
  bairro: z.string().trim().min(2).max(100),
  cidade: z.string().trim().min(2).max(100),
  uf: z
    .string()
    .length(2)
    .transform((v) => v.toUpperCase()),
});
export type Endereco = z.infer<typeof enderecoSchema>;
