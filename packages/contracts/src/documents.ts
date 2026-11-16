const onlyDigits = (value: string): string => value.replace(/\D/g, '');

const allSameDigit = (digits: string): boolean => /^(\d)\1*$/.test(digits);

function checkDigit(digits: string, weights: readonly number[]): number {
  const sum = weights.reduce((acc, weight, i) => acc + Number(digits[i]) * weight, 0);
  const rest = sum % 11;
  return rest < 2 ? 0 : 11 - rest;
}

/** Valida CPF (com ou sem máscara) pelos dígitos verificadores. */
export function isValidCpf(value: string): boolean {
  const digits = onlyDigits(value);
  if (digits.length !== 11 || allSameDigit(digits)) return false;
  const d1 = checkDigit(digits, [10, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = checkDigit(digits, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(digits[9]) && d2 === Number(digits[10]);
}

/** Valida CNPJ numérico (com ou sem máscara) pelos dígitos verificadores. */
export function isValidCnpj(value: string): boolean {
  const digits = onlyDigits(value);
  if (digits.length !== 14 || allSameDigit(digits)) return false;
  const d1 = checkDigit(digits, [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const d2 = checkDigit(digits, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return d1 === Number(digits[12]) && d2 === Number(digits[13]);
}

export const normalizeDocument = onlyDigits;

/**
 * CPF mascarado para exibição (LGPD): mostra só os dígitos do meio, como faz a
 * Receita em documentos públicos. Ex.: 12345678909 → ***.456.789-**.
 */
export function maskCpf(cpf: string): string {
  const digits = onlyDigits(cpf);
  if (digits.length !== 11) return '***.***.***-**';
  return `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`;
}

/** Placa normalizada (sem hífen/espaços, maiúsculas). Aceita padrão antigo e Mercosul. */
export function normalizePlaca(value: string): string {
  return value.replace(/[\s-]/g, '').toUpperCase();
}

export function isValidPlaca(value: string): boolean {
  return /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(normalizePlaca(value));
}
