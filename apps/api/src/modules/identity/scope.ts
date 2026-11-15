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
