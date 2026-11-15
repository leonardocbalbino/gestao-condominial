/**
 * Catálogo de permissões granulares. Papéis (inclusive os customizados pela gestora)
 * são combinações destas chaves. A tabela `permission` do banco é semeada a partir daqui.
 */
export const PERMISSIONS = {
  'condominio:create': 'Criar condomínios',
  'condominio:read': 'Ver dados cadastrais do condomínio',
  'role:manage': 'Criar papéis e atribuí-los a usuários',
  'audit:read': 'Ver e verificar a trilha de auditoria',
} as const;

export type PermissionKey = keyof typeof PERMISSIONS;

export const PERMISSION_KEYS = Object.keys(PERMISSIONS) as PermissionKey[];

export function isPermissionKey(value: string): value is PermissionKey {
  return Object.hasOwn(PERMISSIONS, value);
}

interface SystemRoleDefinition {
  name: string;
  requiresMfa: boolean;
  permissions: readonly PermissionKey[];
}

/** Papéis de sistema (gestora_id nulo no banco), disponíveis para todas as gestoras. */
export const SYSTEM_ROLES = {
  gestora_admin: {
    name: 'Administrador da gestora',
    requiresMfa: true,
    permissions: PERMISSION_KEYS,
  },
  sindico: {
    name: 'Síndico',
    requiresMfa: true,
    permissions: ['condominio:read'],
  },
  conselheiro: {
    name: 'Conselheiro',
    requiresMfa: true,
    permissions: ['condominio:read'],
  },
  morador: {
    name: 'Morador',
    requiresMfa: false,
    permissions: [],
  },
} as const satisfies Record<string, SystemRoleDefinition>;

export type SystemRoleKey = keyof typeof SYSTEM_ROLES;
