/** Data de hoje no fuso do Brasil (datas de caixa e vencimentos são de calendário local). */
export const todayInBrazil = (): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());

/** '2026-10' → '2026-10-01'. Aceita também uma data completa. */
export const firstDayOf = (value: string): string => `${value.slice(0, 7)}-01`;

/** Mês seguinte, no formato AAAA-MM-01. */
export const nextMonth = (value: string): string => {
  const [y, m] = value.split('-').map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, '0')}-01`;
};
