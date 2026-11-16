/** Resultado de uma server action, exibido pelo ActionForm. */
export interface ActionState {
  ok?: string;
  error?: string;
}

/** Erro de validação do formulário, com mensagem pronta para mostrar à pessoa. */
export class UserError extends Error {}

/** Lê um campo de texto obrigatório do formulário. */
export function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

/** Campo opcional: string vazia vira undefined (a API não recebe ""). */
export function optional(form: FormData, name: string): string | undefined {
  return text(form, name) || undefined;
}
