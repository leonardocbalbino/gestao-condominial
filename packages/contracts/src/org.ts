import { z } from 'zod';
import { isValidCnpj, normalizeDocument } from './documents';

export const cnpjSchema = z.string().refine(isValidCnpj, 'CNPJ inválido').transform(normalizeDocument);

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
