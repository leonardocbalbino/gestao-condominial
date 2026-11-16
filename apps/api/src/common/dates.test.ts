import { describe, expect, it } from 'vitest';
import { dateInBrazil, firstDayOf, nextMonth } from './dates';

describe('datas de calendário no fuso do Brasil', () => {
  it('23h de Brasília ainda é o mesmo dia, embora em UTC já seja o seguinte', () => {
    expect(dateInBrazil(new Date('2026-11-16T02:00:00Z'))).toBe('2026-11-15');
    expect(dateInBrazil(new Date('2026-11-16T03:00:00Z'))).toBe('2026-11-16');
  });

  it('primeiro dia e mês seguinte, inclusive na virada do ano', () => {
    expect(firstDayOf('2026-10-17')).toBe('2026-10-01');
    expect(nextMonth('2026-12-01')).toBe('2027-01-01');
    expect(nextMonth('2026-01-31')).toBe('2026-02-01');
  });
});
