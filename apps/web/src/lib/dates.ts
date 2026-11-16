const brazilDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' });

/** Hoje (AAAA-MM-DD) no fuso do Brasil. */
export const todayIso = (): string => brazilDate.format(new Date());

/** Mês atual (AAAA-MM) no fuso do Brasil. */
export const todayMonth = (): string => todayIso().slice(0, 7);
