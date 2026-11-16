import { z } from 'zod';
import type { Branding } from './org';
import { isPermissionKey, type PermissionKey } from './permissions';

export const createRoleRequestSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{1,62}$/, 'Use letras minúsculas, números e _'),
  name: z.string().trim().min(2).max(120),
  requiresMfa: z.boolean(),
  permissions: z
    .array(z.string().refine(isPermissionKey, 'Permissão desconhecida'))
    .min(1)
    .transform((keys) => [...new Set(keys)] as PermissionKey[]),
});
export type CreateRoleRequest = z.infer<typeof createRoleRequestSchema>;

/** Escopo da atribuição: a gestora inteira ou um condomínio específico. */
export const roleScopeSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('gestora') }),
  z.object({ type: z.literal('condominio'), condominioId: z.uuid() }),
]);
export type RoleScope = z.infer<typeof roleScopeSchema>;

/**
 * Escopo como aparece nas respostas: inclui a unidade, criada só pelo vínculo
 * pessoa↔unidade (nunca diretamente por /role-assignments).
 */
export type AssignedScope = RoleScope | { type: 'unit'; condominioId: string; unitId: string };

export const createRoleAssignmentRequestSchema = z
  .object({
    userId: z.uuid(),
    roleId: z.uuid(),
    scope: roleScopeSchema,
    validFrom: z.coerce.date().optional(),
    validUntil: z.coerce.date().optional(),
  })
  .refine(
    (v) => v.validFrom === undefined || v.validUntil === undefined || v.validUntil > v.validFrom,
    {
      message: 'validUntil deve ser posterior a validFrom',
      path: ['validUntil'],
    },
  );
export type CreateRoleAssignmentRequest = z.infer<typeof createRoleAssignmentRequestSchema>;

export interface RoleDto {
  id: string;
  key: string;
  name: string;
  requiresMfa: boolean;
  /** Papel de sistema (comum a todas as gestoras) ou customizado pela gestora. */
  system: boolean;
  permissions: PermissionKey[];
}

export interface RoleAssignmentDto {
  id: string;
  userId: string;
  roleId: string;
  scope: AssignedScope;
  validFrom: string;
  validUntil: string | null;
}

export interface MeDto {
  id: string;
  email: string;
  isPlatformAdmin: boolean;
  mfaEnabled: boolean;
  gestoras: {
    id: string;
    nome: string;
    /** Identidade visual da gestora (white label do web e do app). */
    branding: Branding;
    roles: { key: string; name: string; scope: AssignedScope }[];
  }[];
}
