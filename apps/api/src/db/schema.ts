/**
 * Espelho tipado das tabelas criadas em `migrations/*.sql` (fonte da verdade).
 * O teste `schema-drift` falha se uma coluna daqui não existir no banco ou vice-versa.
 */
import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  char,
  customType,
  inet,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const ltree = customType<{ data: string }>({
  dataType: () => 'ltree',
});

const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();

export const gestora = pgTable('gestora', {
  id: uuid('id').primaryKey().defaultRandom(),
  nome: text('nome').notNull(),
  cnpj: varchar('cnpj', { length: 14 }).notNull(),
  branding: jsonb('branding').$type<Record<string, unknown>>().notNull().default({}),
  path: ltree('path').generatedAlwaysAs(sql`text2ltree(app_scope_label('g', id))`),
  createdAt: createdAt(),
});

export const appUser = pgTable('app_user', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull(),
  cpf: varchar('cpf', { length: 11 }),
  passwordHash: text('password_hash'),
  totpSecretEnc: text('totp_secret_enc'),
  totpEnabledAt: timestamp('totp_enabled_at', { withTimezone: true }),
  totpLastStep: bigint('totp_last_step', { mode: 'number' }),
  isPlatformAdmin: boolean('is_platform_admin').notNull().default(false),
  disabledAt: timestamp('disabled_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export const refreshSession = pgTable('refresh_session', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  familyId: uuid('family_id').notNull(),
  tokenHash: char('token_hash', { length: 64 }).notNull(),
  mfa: boolean('mfa').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  replacedBy: uuid('replaced_by'),
  createdAt: createdAt(),
});

export const magicLinkToken = pgTable('magic_link_token', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  tokenHash: char('token_hash', { length: 64 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
  createdAt: createdAt(),
});

export const person = pgTable('person', {
  id: uuid('id').primaryKey().defaultRandom(),
  gestoraId: uuid('gestora_id').notNull(),
  userId: uuid('user_id'),
  nome: text('nome').notNull(),
  cpf: varchar('cpf', { length: 11 }),
  email: text('email'),
  telefone: text('telefone'),
  createdAt: createdAt(),
});

export const condominio = pgTable('condominio', {
  id: uuid('id').primaryKey().defaultRandom(),
  gestoraId: uuid('gestora_id').notNull(),
  nome: text('nome').notNull(),
  cnpj: varchar('cnpj', { length: 14 }).notNull(),
  config: jsonb('config').$type<Record<string, unknown>>().notNull().default({}),
  path: ltree('path').generatedAlwaysAs(
    sql`text2ltree(app_scope_label('g', gestora_id) || '.' || app_scope_label('c', id))`,
  ),
  createdAt: createdAt(),
});

export const permission = pgTable('permission', {
  key: text('key').primaryKey(),
  description: text('description').notNull(),
});

export const role = pgTable('role', {
  id: uuid('id').primaryKey().defaultRandom(),
  gestoraId: uuid('gestora_id'),
  key: text('key').notNull(),
  name: text('name').notNull(),
  requiresMfa: boolean('requires_mfa').notNull(),
  createdAt: createdAt(),
});

export const rolePermission = pgTable(
  'role_permission',
  {
    roleId: uuid('role_id').notNull(),
    permissionKey: text('permission_key').notNull(),
    gestoraId: uuid('gestora_id'),
  },
  (t) => [primaryKey({ columns: [t.roleId, t.permissionKey] })],
);

export const roleAssignment = pgTable('role_assignment', {
  id: uuid('id').primaryKey().defaultRandom(),
  gestoraId: uuid('gestora_id').notNull(),
  userId: uuid('user_id').notNull(),
  roleId: uuid('role_id').notNull(),
  scopePath: ltree('scope_path').notNull(),
  requiresMfa: boolean('requires_mfa').notNull(),
  validFrom: timestamp('valid_from', { withTimezone: true }).notNull().defaultNow(),
  validUntil: timestamp('valid_until', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  grantedBy: uuid('granted_by'),
  createdAt: createdAt(),
});

export const auditLog = pgTable('audit_log', {
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  gestoraId: uuid('gestora_id'),
  // Preenchidos pelo trigger audit_log_chain; os valores enviados são sobrescritos.
  chain: text('chain').notNull().default(''),
  seq: bigint('seq', { mode: 'number' }).notNull().default(0),
  actorUserId: uuid('actor_user_id'),
  action: text('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id'),
  before: jsonb('before'),
  after: jsonb('after'),
  ip: inet('ip'),
  requestId: text('request_id'),
  createdAt: createdAt(),
  prevHash: char('prev_hash', { length: 64 }).notNull().default(''),
  hash: char('hash', { length: 64 }).notNull().default(''),
});

// ---------------------------------------------------------------------------
// 0002 — cadastro
// ---------------------------------------------------------------------------

export const block = pgTable('block', {
  id: uuid('id').primaryKey().defaultRandom(),
  gestoraId: uuid('gestora_id').notNull(),
  condominioId: uuid('condominio_id').notNull(),
  nome: text('nome').notNull(),
  andares: integer('andares'),
  createdAt: createdAt(),
});

export const UNIT_TYPES = ['apartamento', 'casa', 'sala', 'loja'] as const;

export const unit = pgTable('unit', {
  id: uuid('id').primaryKey().defaultRandom(),
  gestoraId: uuid('gestora_id').notNull(),
  condominioId: uuid('condominio_id').notNull(),
  blockId: uuid('block_id'),
  andar: integer('andar'),
  numero: text('numero').notNull(),
  tipo: text('tipo', { enum: UNIT_TYPES }).notNull(),
  // numeric volta como string do driver: preserva a precisão da fração ideal.
  fracaoIdeal: numeric('fracao_ideal', { precision: 12, scale: 10 }),
  path: ltree('path').generatedAlwaysAs(
    sql`text2ltree(app_scope_label('g', gestora_id) || '.' || app_scope_label('c', condominio_id) || '.' || app_scope_label('u', id))`,
  ),
  createdAt: createdAt(),
});

export const vehicle = pgTable('vehicle', {
  id: uuid('id').primaryKey().defaultRandom(),
  gestoraId: uuid('gestora_id').notNull(),
  condominioId: uuid('condominio_id').notNull(),
  unitId: uuid('unit_id').notNull(),
  placa: varchar('placa', { length: 7 }).notNull(),
  modelo: text('modelo'),
  cor: text('cor'),
  removidoEm: timestamp('removido_em', { withTimezone: true }),
  createdAt: createdAt(),
});

export const unitAccessGrant = pgTable('unit_access_grant', {
  id: uuid('id').primaryKey().defaultRandom(),
  gestoraId: uuid('gestora_id').notNull(),
  condominioId: uuid('condominio_id').notNull(),
  unitId: uuid('unit_id').notNull(),
  personId: uuid('person_id').notNull(),
  perfil: text('perfil', {
    enum: ['proprietario', 'secundario', 'inquilino', 'dependente', 'hospede'],
  }).notNull(),
  permissoes: text('permissoes')
    .array()
    .notNull()
    .default(sql`'{}'`),
  roleAssignmentId: uuid('role_assignment_id'),
  concedidoPor: uuid('concedido_por'),
  inicio: timestamp('inicio', { withTimezone: true }).notNull().defaultNow(),
  fim: timestamp('fim', { withTimezone: true }),
  revogadoEm: timestamp('revogado_em', { withTimezone: true }),
  createdAt: createdAt(),
});

export const schema = {
  gestora,
  appUser,
  refreshSession,
  magicLinkToken,
  person,
  condominio,
  permission,
  role,
  rolePermission,
  roleAssignment,
  auditLog,
  block,
  unit,
  vehicle,
  unitAccessGrant,
};
