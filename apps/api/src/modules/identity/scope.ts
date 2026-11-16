/**
 * Caminhos ltree de escopo. Uma atribuição com escopo `g<gestora>` cobre todos os
 * condomínios da gestora (`g<gestora>.c<condominio>`), via operador `@>` do ltree.
 * Mesmo formato gerado pelas colunas `path` no banco (função app_scope_label).
 */
const label = (prefix: string, id: string): string => `${prefix}${id.replace(/-/g, '')}`;

export function gestoraScope(gestoraId: string): string {
  return label('g', gestoraId);
}

export function condominioScope(gestoraId: string, condominioId: string): string {
  return `${gestoraScope(gestoraId)}.${label('c', condominioId)}`;
}

/** Escopo de uma unidade: `g<gestora>.c<condominio>.u<unidade>` (mesmo formato de unit.path). */
export function unitScope(gestoraId: string, condominioId: string, unitId: string): string {
  return `${condominioScope(gestoraId, condominioId)}.${label('u', unitId)}`;
}

const toUuid = (hex: string): string =>
  `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;

/** Ids contidos num caminho de escopo (inverso das funções acima). */
export function parseScope(path: string): {
  gestoraId: string;
  condominioId?: string;
  unitId?: string;
} {
  const [g = '', c, u] = path.split('.');
  return {
    gestoraId: toUuid(g.slice(1)),
    ...(c ? { condominioId: toUuid(c.slice(1)) } : {}),
    ...(u ? { unitId: toUuid(u.slice(1)) } : {}),
  };
}
