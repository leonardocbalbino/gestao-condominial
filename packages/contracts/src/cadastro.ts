import { z } from 'zod';
import { isValidCpf, isValidPlaca, normalizeDocument, normalizePlaca } from './documents';

export const UNIT_TYPES = ['apartamento', 'casa', 'sala', 'loja'] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

/** Fração ideal como texto decimal (preserva a precisão; nunca float). Ex.: "0.0125". */
export const fracaoIdealSchema = z
  .string()
  .trim()
  .regex(/^(0|[1-9]\d?)([.,]\d{1,10})?$/, 'Use um número decimal com até 10 casas')
  .transform((v) => v.replace(',', '.'))
  .refine((v) => Number(v) > 0, 'A fração ideal precisa ser maior que zero');

export const createBlockRequestSchema = z.object({
  nome: z.string().trim().min(1).max(60),
  andares: z.number().int().min(0).max(300).optional(),
});
export type CreateBlockRequest = z.infer<typeof createBlockRequestSchema>;

/**
 * Geração automática: "Torre A, 10 andares, 4 por andar" cria 101…104 até 1001…1004.
 * Numeração = andar × 100 + posição (posição com 2 dígitos).
 */
export const generateBlockRequestSchema = z.object({
  nome: z.string().trim().min(1).max(60),
  andares: z.number().int().min(1).max(300),
  unidadesPorAndar: z.number().int().min(1).max(99),
  andarInicial: z.number().int().min(0).max(300).default(1),
  tipo: z.enum(UNIT_TYPES).default('apartamento'),
  fracaoIdeal: fracaoIdealSchema.optional(),
});
export type GenerateBlockRequest = z.infer<typeof generateBlockRequestSchema>;

export interface BlockDto {
  id: string;
  condominioId: string;
  nome: string;
  andares: number | null;
}

export const createUnitRequestSchema = z.object({
  blockId: z.uuid().optional(),
  andar: z.number().int().min(-10).max(300).optional(),
  numero: z.string().trim().min(1).max(20),
  tipo: z.enum(UNIT_TYPES).default('apartamento'),
  fracaoIdeal: fracaoIdealSchema.optional(),
});
export type CreateUnitRequest = z.infer<typeof createUnitRequestSchema>;

export const updateUnitRequestSchema = z.object({
  fracaoIdeal: fracaoIdealSchema.nullable().optional(),
  tipo: z.enum(UNIT_TYPES).optional(),
});
export type UpdateUnitRequest = z.infer<typeof updateUnitRequestSchema>;

/**
 * Importação CSV (separador `;` ou `,`), com cabeçalho:
 * `bloco;andar;numero;tipo;fracao_ideal`. Bloco e fração podem ficar vazios.
 * Blocos inexistentes são criados. A importação é tudo ou nada.
 */
export const importUnitsRequestSchema = z.object({
  csv: z.string().min(1).max(2_000_000),
});
export type ImportUnitsRequest = z.infer<typeof importUnitsRequestSchema>;

export interface ImportUnitsResult {
  blocosCriados: number;
  unidadesCriadas: number;
}

export interface UnitDto {
  id: string;
  condominioId: string;
  blockId: string | null;
  blockNome: string | null;
  andar: number | null;
  numero: string;
  tipo: UnitType;
  fracaoIdeal: string | null;
}

export const createPersonRequestSchema = z.object({
  nome: z.string().trim().min(2).max(200),
  cpf: z.string().refine(isValidCpf, 'CPF inválido').transform(normalizeDocument).optional(),
  email: z
    .email()
    .transform((v) => v.toLowerCase())
    .optional(),
  telefone: z.string().transform(normalizeDocument).pipe(z.string().min(10).max(13)).optional(),
});
export type CreatePersonRequest = z.infer<typeof createPersonRequestSchema>;

/** Pessoa como aparece na UI: CPF sempre mascarado (LGPD). */
export interface PersonDto {
  id: string;
  nome: string;
  cpfMascarado: string | null;
  email: string | null;
  telefone: string | null;
  /** Já tem login na plataforma. */
  temAcesso: boolean;
}

export const createVehicleRequestSchema = z.object({
  placa: z.string().refine(isValidPlaca, 'Placa inválida').transform(normalizePlaca),
  modelo: z.string().trim().max(60).optional(),
  cor: z.string().trim().max(30).optional(),
});
export type CreateVehicleRequest = z.infer<typeof createVehicleRequestSchema>;

export interface VehicleDto {
  id: string;
  unitId: string;
  placa: string;
  modelo: string | null;
  cor: string | null;
}

export const UNIT_GRANT_PERMISSIONS = [
  'avisos',
  'reservas',
  'portaria',
  'pagamento',
  'contas',
] as const;
export type UnitGrantPermission = (typeof UNIT_GRANT_PERMISSIONS)[number];

/**
 * Cadastra o proprietário da unidade (Fase 1). Se a pessoa já existe na gestora (mesmo
 * CPF ou e-mail), reaproveita o cadastro. Ela recebe convite por link mágico e passa a
 * ver a unidade no app.
 */
export const createOwnerGrantRequestSchema = createPersonRequestSchema.extend({
  email: z.email().transform((v) => v.toLowerCase()),
});
export type CreateOwnerGrantRequest = z.infer<typeof createOwnerGrantRequestSchema>;

export interface UnitGrantDto {
  id: string;
  unitId: string;
  personId: string;
  perfil: 'proprietario' | 'secundario' | 'inquilino' | 'dependente' | 'hospede';
  permissoes: UnitGrantPermission[];
  inicio: string;
  fim: string | null;
}
