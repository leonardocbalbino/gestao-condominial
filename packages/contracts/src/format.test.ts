import { describe, expect, it } from 'vitest';
import { formatBRL, formatDate, formatMonth, parseBRL } from './format';

describe('formatação', () => {
  it('centavos em reais, com milhar e vírgula', () => {
    expect(formatBRL(126_500)).toBe('R$ 1.265,00');
    expect(formatBRL(5)).toBe('R$ 0,05');
    expect(formatBRL(-30_000)).toBe('-R$ 300,00');
  });

  it('datas e meses', () => {
    expect(formatDate('2026-11-10')).toBe('10/11/2026');
    expect(formatMonth('2026-03')).toBe('março de 2026');
  });

  it('lê o valor digitado sem float', () => {
    expect(parseBRL('R$ 1.265,50')).toBe(126_550);
    expect(parseBRL('0,1')).toBe(10);
    expect(parseBRL('300')).toBe(30_000);
    expect(parseBRL('12,345')).toBeNull();
    expect(parseBRL('abc')).toBeNull();
  });
});
