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
  date,
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
  endereco: jsonb('endereco').$type<Record<string, unknown>>(),
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

// ---------------------------------------------------------------------------
// 0003 — anexos e razão
// ---------------------------------------------------------------------------

const money = (name: string) => bigint(name, { mode: 'number' });

export const attachment = pgTable('attachment', {
  id: uuid('id').primaryKey().defaultRandom(),
  gestoraId: uuid('gestora_id').notNull(),
  condominioId: uuid('condominio_id').notNull(),
  nomeArquivo: text('nome_arquivo').notNull(),
  contentType: text('content_type').notNull(),
  tamanho: bigint('tamanho', { mode: 'number' }).notNull(),
  sha256: char('sha256', { length: 64 }).notNull(),
  storageKey: text('storage_key').notNull(),
  uploadedBy: uuid('uploaded_by'),
  createdAt: createdAt(),
});

export const ACCOUNT_NATUREZAS = ['ativo', 'passivo', 'patrimonio', 'receita', 'despesa'] as const;
export const ACCOUNT_GRUPOS = ['ordinaria', 'fundo_reserva', 'obras'] as const;
export const ACCOUNT_PAPEIS = [
  'banco',
  'saldo_inicial',
  'taxa_ordinaria',
  'fundo_reserva',
  'multa',
  'juros',
  'aluguel_vaga',
  'tarifa_bancaria',
] as const;

export const account = pgTable('account', {
  id: uuid('id').primaryKey().defaultRandom(),
  gestoraId: uuid('gestora_id').notNull(),
  condominioId: uuid('condominio_id'),
  codigo: text('codigo').notNull(),
  nome: text('nome').notNull(),
  natureza: text('natureza', { enum: ACCOUNT_NATUREZAS }).notNull(),
  grupo: text('grupo', { enum: ACCOUNT_GRUPOS }),
  analitica: boolean('analitica').notNull(),
  caixa: boolean('caixa').notNull().default(false),
  papelSistema: text('papel_sistema', { enum: ACCOUNT_PAPEIS }),
  ativa: boolean('ativa').notNull().default(true),
  createdAt: createdAt(),
});

export const PERIOD_STATUS = ['aberto', 'em_revisao', 'aprovado', 'publicado'] as const;

export const accountingPeriod = pgTable('accounting_period', {
  id: uuid('id').primaryKey().defaultRandom(),
  gestoraId: uuid('gestora_id').notNull(),
  condominioId: uuid('condominio_id').notNull(),
  mes: date('mes', { mode: 'string' }).notNull(),
  status: text('status', { enum: PERIOD_STATUS }).notNull().default('aberto'),
  hash: char('hash', { length: 64 }),
  fechadoEm: timestamp('fechado_em', { withTimezone: true }),
  fechadoPor: uuid('fechado_por'),
  createdAt: createdAt(),
});

export const ENTRY_ORIGENS = [
  'manual',
  'saldo_inicial',
  'recebimento',
  'pagamento',
  'tarifa',
  'estorno',
] as const;

export const journalEntry = pgTable('journal_entry', {
  id: uuid('id').primaryKey().defaultRandom(),
  gestoraId: uuid('gestora_id').notNull(),
  condominioId: uuid('condominio_id').notNull(),
  periodId: uuid('period_id').notNull(),
  seq: bigint('seq', { mode: 'number' }).generatedAlwaysAsIdentity(),
  dataCompetencia: date('data_competencia', { mode: 'string' }).notNull(),
  dataCaixa: date('data_caixa', { mode: 'string' }).notNull(),
  historico: text('historico').notNull(),
  origem: text('origem', { enum: ENTRY_ORIGENS }).notNull(),
  origemRef: text('origem_ref'),
  estornoDe: uuid('estorno_de'),
  motivoEstorno: text('motivo_estorno'),
  comprovanteId: uuid('comprovante_id'),
  createdBy: uuid('created_by'),
  createdAt: createdAt(),
});

export const journalLine = pgTable('journal_line', {
  id: uuid('id').primaryKey().defaultRandom(),
  gestoraId: uuid('gestora_id').notNull(),
  condominioId: uuid('condominio_id').notNull(),
  entryId: uuid('entry_id').notNull(),
  accountId: uuid('account_id').notNull(),
  valorCentavos: money('valor_centavos').notNull(),
});

// ---------------------------------------------------------------------------
// 0004 — cobrança
// ---------------------------------------------------------------------------

export const outboxEvent = pgTable('outbox_event', {
  id: uuid('id').primaryKey().defaultRandom(),
  gestoraId: uuid('gestora_id').notNull(),
  condominioId: uuid('condominio_id'),
  topic: text('topic').notNull(),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  createdAt: createdAt(),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  processedAt: timestamp('processed_at', { withTimezone: true }),
  attempts: integer('attempts').notNull().default(0),
  lastError: text('last_error'),
});

export const paymentAccount = pgTable('payment_account', {
  id: uuid('id').primaryKey().defaultRandom(),
  gestoraId: uuid('gestora_id').notNull(),
  condominioId: uuid('condominio_id').notNull(),
  provider: text('provider', { enum: ['fake', 'asaas'] }).notNull(),
  providerAccountId: text('provider_account_id').notNull(),
  walletId: text('wallet_id'),
  apiKeyEnc: text('api_key_enc').notNull(),
  webhookTokenEnc: text('webhook_token_enc').notNull(),
  extratoAte: date('extrato_ate', { mode: 'string' }),
  createdAt: createdAt(),
});

export const budget = pgTable('budget', {
  id: uuid('id').primaryKey().defaultRandom(),
  gestoraId: uuid('gestora_id').notNull(),
  condominioId: uuid('condominio_id').notNull(),
  ano: integer('ano').notNull(),
  status: text('status', { enum: ['rascunho', 'aprovado'] })
    .notNull()
    .default('rascunho'),
  aprovadoEm: timestamp('aprovado_em', { withTimezone: true }),
  aprovadoPor: uuid('aprovado_por'),
  createdAt: createdAt(),
});

export const budgetLine = pgTable('budget_line', {
  id: uuid('id').primaryKey().defaultRandom(),
  gestoraId: uuid('gestora_id').notNull(),
  condominioId: uuid('condominio_id').notNull(),
  budgetId: uuid('budget_id').notNull(),
  accountId: uuid('account_id').notNull(),
  valorMensalCentavos: money('valor_mensal_centavos').notNull(),
  criterio: text('criterio', { enum: ['fracao_ideal', 'igualitario'] }).notNull(),
});

export const CHARGE_STATUS = [
  'pendente_emissao',
  'emitida',
  'erro_emissao',
  'paga',
  'cancelada',
] as const;

export const charge = pgTable('charge', {
  id: uuid('id').primaryKey().defaultRandom(),
  gestoraId: uuid('gestora_id').notNull(),
  condominioId: uuid('condominio_id').notNull(),
  unitId: uuid('unit_id').notNull(),
  competencia: date('competencia', { mode: 'string' }).notNull(),
  tipo: text('tipo', { enum: ['ordinaria', 'extra'] })
    .notNull()
    .default('ordinaria'),
  vencimento: date('vencimento', { mode: 'string' }).notNull(),
  valorCentavos: money('valor_centavos').notNull(),
  multaBp: integer('multa_bp').notNull(),
  jurosMensalBp: integer('juros_mensal_bp').notNull(),
  status: text('status', { enum: CHARGE_STATUS }).notNull().default('pendente_emissao'),
  pagadorPersonId: uuid('pagador_person_id'),
  providerChargeId: text('provider_charge_id'),
  linhaDigitavel: text('linha_digitavel'),
  pixCopiaCola: text('pix_copia_cola'),
  boletoUrl: text('boleto_url'),
  erroEmissao: text('erro_emissao'),
  pagoEm: date('pago_em', { mode: 'string' }),
  valorPagoCentavos: money('valor_pago_centavos'),
  createdBy: uuid('created_by'),
  createdAt: createdAt(),
});

export const chargeItem = pgTable('charge_item', {
  id: uuid('id').primaryKey().defaultRandom(),
  gestoraId: uuid('gestora_id').notNull(),
  condominioId: uuid('condominio_id').notNull(),
  chargeId: uuid('charge_id').notNull(),
  accountId: uuid('account_id').notNull(),
  descricao: text('descricao').notNull(),
  valorCentavos: money('valor_centavos').notNull(),
});

export const paymentEvent = pgTable('payment_event', {
  id: uuid('id').primaryKey().defaultRandom(),
  gestoraId: uuid('gestora_id').notNull(),
  condominioId: uuid('condominio_id').notNull(),
  provider: text('provider').notNull(),
  eventId: text('event_id').notNull(),
  tipo: text('tipo').notNull(),
  payload: jsonb('payload').notNull(),
  recebidoEm: timestamp('recebido_em', { withTimezone: true }).notNull().defaultNow(),
  processadoEm: timestamp('processado_em', { withTimezone: true }),
  resultado: text('resultado'),
});

export const PAYABLE_STATUS = [
  'aguardando_aprovacao',
  'aguardando_segunda_aprovacao',
  'aprovada',
  'pagamento_solicitado',
  'paga',
  'rejeitada',
] as const;

export const payable = pgTable('payable', {
  id: uuid('id').primaryKey().defaultRandom(),
  gestoraId: uuid('gestora_id').notNull(),
  condominioId: uuid('condominio_id').notNull(),
  fornecedor: text('fornecedor').notNull(),
  fornecedorDocumento: varchar('fornecedor_documento', { length: 14 }),
  descricao: text('descricao').notNull(),
  accountId: uuid('account_id').notNull(),
  valorCentavos: money('valor_centavos').notNull(),
  vencimento: date('vencimento', { mode: 'string' }).notNull(),
  linhaDigitavel: text('linha_digitavel'),
  comprovanteId: uuid('comprovante_id').notNull(),
  requerSegundaAprovacao: boolean('requer_segunda_aprovacao').notNull(),
  status: text('status', { enum: PAYABLE_STATUS }).notNull().default('aguardando_aprovacao'),
  aprovadoPor: uuid('aprovado_por'),
  aprovadoEm: timestamp('aprovado_em', { withTimezone: true }),
  segundaAprovacaoPor: uuid('segunda_aprovacao_por'),
  segundaAprovacaoEm: timestamp('segunda_aprovacao_em', { withTimezone: true }),
  rejeitadoPor: uuid('rejeitado_por'),
  motivoRejeicao: text('motivo_rejeicao'),
  providerPaymentId: text('provider_payment_id'),
  pagoEm: date('pago_em', { mode: 'string' }),
  createdBy: uuid('created_by'),
  createdAt: createdAt(),
});

export const bankStatementLine = pgTable('bank_statement_line', {
  id: uuid('id').primaryKey().defaultRandom(),
  gestoraId: uuid('gestora_id').notNull(),
  condominioId: uuid('condominio_id').notNull(),
  providerTxId: text('provider_tx_id').notNull(),
  data: date('data', { mode: 'string' }).notNull(),
  valorCentavos: money('valor_centavos').notNull(),
  descricao: text('descricao').notNull(),
  refTipo: text('ref_tipo', { enum: ['charge', 'bill'] }),
  refId: text('ref_id'),
  status: text('status', { enum: ['conciliada', 'excecao', 'resolvida'] }).notNull(),
  matchEntryId: uuid('match_entry_id'),
  motivo: text('motivo'),
  resolvidoPor: uuid('resolvido_por'),
  resolvidoEm: timestamp('resolvido_em', { withTimezone: true }),
  notaResolucao: text('nota_resolucao'),
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
  attachment,
  account,
  accountingPeriod,
  journalEntry,
  journalLine,
  outboxEvent,
  paymentAccount,
  budget,
  budgetLine,
  charge,
  chargeItem,
  paymentEvent,
  payable,
  bankStatementLine,
};
