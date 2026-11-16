/**
 * Formatação para a interface (web e app), sempre em português do Brasil. Dinheiro chega
 * em centavos inteiros; a conversão para reais acontece só na hora de mostrar.
 */

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** 126500 → "R$ 1.265,00". */
export function formatBRL(centavos: number): string {
  return brl.format(centavos / 100).replace(/\u00a0/g, ' ');
}

/** "2026-11-10" → "10/11/2026". */
export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split('-');
  return `${d}/${m}/${y}`;
}

/** "2026-11" → "novembro de 2026". */
export function formatMonth(competencia: string): string {
  const [y, m] = competencia.split('-').map(Number) as [number, number];
  return new Intl.DateTimeFormat('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/**
 * "R$ 1.265,00" ou "1265,5" → 126550. Aceita o que a pessoa digita num campo de valor
 * (com ou sem R$, ponto de milhar e vírgula decimal). Devolve null se não for um valor.
 */
export function parseBRL(text: string): number | null {
  const clean = text
    .replace(/[R$\s]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null;
  const [int = '0', dec = ''] = clean.split('.');
  return Number(int) * 100 + Number(dec.padEnd(2, '0'));
}
