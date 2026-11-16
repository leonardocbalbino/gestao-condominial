/**
 * Catálogo de permissões granulares. Papéis (inclusive os customizados pela gestora)
 * são combinações destas chaves. A tabela `permission` do banco é semeada a partir daqui
 * e um teste garante que os dois catálogos são iguais.
 */
export const PERMISSIONS = {
  'condominio:create': 'Criar condomínios',
  'condominio:read': 'Ver dados cadastrais do condomínio',
  'role:manage': 'Criar papéis e atribuí-los a usuários',
  'audit:read': 'Ver e verificar a trilha de auditoria',
  'condominio:configure': 'Alterar configurações do condomínio (módulos, cobrança, limites)',
  'unidade:read': 'Ver blocos, unidades e veículos',
  'unidade:manage': 'Cadastrar blocos, unidades e veículos',
  'pessoa:read': 'Ver cadastro de pessoas (CPF mascarado)',
  'pessoa:manage': 'Cadastrar pessoas e convidar moradores',
  'contas:manage': 'Manter o plano de contas',
  'orcamento:manage': 'Elaborar o orçamento anual',
  'financeiro:read': 'Ver lançamentos, balancete e relatórios financeiros',
  'lancamento:create': 'Lançar receitas e despesas',
  'cobranca:manage': 'Gerar rateio e emitir cobranças',
  'cobranca:read': 'Ver cobranças e pagamentos',
  'pagamento:request': 'Cadastrar contas a pagar',
  'pagamento:approve': 'Aprovar contas a pagar',
  'pagamento:approve_second': 'Segunda assinatura em pagamentos acima do limite',
  'conciliacao:manage': 'Conciliar extrato e tratar exceções',
  'periodo:close': 'Fechar o mês',
  'inadimplencia:read': 'Ver inadimplência nominal',
  'comunicado:publish': 'Publicar comunicados',
  'comunicado:read': 'Ler comunicados',
  'documento:upload': 'Enviar comprovantes e documentos',
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

/**
 * Aprovar pagamento é do síndico e do conselho (matriz §9): a gestora prepara a conta,
 * mas não aprova o próprio pagamento.
 */
const APPROVAL_PERMISSIONS: readonly PermissionKey[] = [
  'pagamento:approve',
  'pagamento:approve_second',
];

/**
 * Permissões que quem tem `role:manage` pode delegar sem possuí-las (a gestora nomeia
 * síndico e conselho, que aprovam pagamentos). Para não virar brecha, ninguém atribui
 * papel a si mesmo.
 */
export const DELEGABLE_WITHOUT_HOLDING: readonly PermissionKey[] = APPROVAL_PERMISSIONS;

/**
 * Papéis de sistema (gestora_id nulo no banco), disponíveis para todas as gestoras.
 * "Síndico lança receitas e despesas" é configurável: a gestora cria um papel customizado
 * com `lancamento:create` e atribui ao síndico daquele condomínio.
 */
export const SYSTEM_ROLES = {
  gestora_admin: {
    name: 'Administrador da gestora',
    requiresMfa: true,
    permissions: PERMISSION_KEYS.filter((p) => !APPROVAL_PERMISSIONS.includes(p)),
  },
  sindico: {
    name: 'Síndico',
    requiresMfa: true,
    permissions: [
      'condominio:read',
      'unidade:read',
      'pessoa:read',
      'pessoa:manage',
      'financeiro:read',
      'cobranca:read',
      'pagamento:approve',
      'inadimplencia:read',
      'comunicado:publish',
      'comunicado:read',
    ],
  },
  conselheiro: {
    name: 'Conselheiro',
    requiresMfa: true,
    permissions: [
      'condominio:read',
      'unidade:read',
      'financeiro:read',
      'cobranca:read',
      'pagamento:approve_second',
      'inadimplencia:read',
      'comunicado:read',
    ],
  },
  /** Atribuído só no escopo de uma unidade (vínculo pessoa↔unidade), nunca à gestora. */
  morador: {
    name: 'Morador',
    requiresMfa: false,
    permissions: ['unidade:read', 'cobranca:read', 'comunicado:read'],
  },
} as const satisfies Record<string, SystemRoleDefinition>;

export type SystemRoleKey = keyof typeof SYSTEM_ROLES;
