import { describe, expect, it } from 'vitest';
import { computeRateio, parseFracao, splitLargestRemainder } from './rateio';

describe('splitLargestRemainder', () => {
  it('R$ 100,00 em 3 partes iguais: o centavo que sobra vai para a primeira (empate)', () => {
    expect(splitLargestRemainder(10_000, [1n, 1n, 1n])).toEqual([3334, 3333, 3333]);
  });

  it('sobra vai para os maiores restos, não para a ordem', () => {
    // Cotas exatas: 33.333…, 66.666… → pisos 33 e 66, resto maior na segunda.
    expect(splitLargestRemainder(100, [1n, 2n])).toEqual([33, 67]);
  });

  it('a soma é sempre o total', () => {
    const weights = [7n, 13n, 1n, 29n, 3n, 47n];
    for (const total of [0, 1, 99, 12_345, 987_654_321]) {
      const parts = splitLargestRemainder(total, weights);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
    }
  });

  it('recusa pesos zerados', () => {
    expect(() => splitLargestRemainder(100, [0n, 0n])).toThrow();
  });
});

describe('parseFracao', () => {
  it('converte para inteiro em 1e-10 sem float', () => {
    expect(parseFracao('0.0833333333')).toBe(833_333_333n);
    expect(parseFracao('0.1')).toBe(1_000_000_000n);
    expect(parseFracao('1')).toBe(10_000_000_000n);
  });
});

describe('computeRateio', () => {
  const units = [
    { id: 'a', fracaoIdeal: '0.5' },
    { id: 'b', fracaoIdeal: '0.3' },
    { id: 'c', fracaoIdeal: '0.2' },
  ];

  it('fração ideal + fundo de reserva de 10% sobre a taxa', () => {
    const r = computeRateio(units, [{ valorCentavos: 1_000_00, criterio: 'fracao_ideal' }], 1000);
    expect(r).toEqual([
      { unitId: 'a', taxaCentavos: 50_000, fundoReservaCentavos: 5_000 },
      { unitId: 'b', taxaCentavos: 30_000, fundoReservaCentavos: 3_000 },
      { unitId: 'c', taxaCentavos: 20_000, fundoReservaCentavos: 2_000 },
    ]);
  });

  it('misto: linhas igualitárias e por fração no mesmo mês', () => {
    const r = computeRateio(
      units,
      [
        { valorCentavos: 1_000_00, criterio: 'fracao_ideal' },
        { valorCentavos: 300_00, criterio: 'igualitario' },
      ],
      0,
    );
    expect(r.map((s) => s.taxaCentavos)).toEqual([60_000, 40_000, 30_000]);
  });

  it('total distribuído bate com o orçamento mesmo com frações "quebradas"', () => {
    const odd = [
      { id: 'a', fracaoIdeal: '0.3333333333' },
      { id: 'b', fracaoIdeal: '0.3333333333' },
      { id: 'c', fracaoIdeal: '0.3333333334' },
    ];
    const r = computeRateio(odd, [{ valorCentavos: 10_001, criterio: 'fracao_ideal' }], 1000);
    expect(r.reduce((a, s) => a + s.taxaCentavos, 0)).toBe(10_001);
    expect(r.reduce((a, s) => a + s.fundoReservaCentavos, 0)).toBe(1_000);
  });

  it('igualitário não exige fração; por fração exige em todas as unidades', () => {
    const semFracao = [
      { id: 'a', fracaoIdeal: null },
      { id: 'b', fracaoIdeal: '0.5' },
    ];
    expect(() =>
      computeRateio(semFracao, [{ valorCentavos: 100, criterio: 'fracao_ideal' }], 0),
    ).toThrow(/fração ideal/);
    expect(
      computeRateio(semFracao, [{ valorCentavos: 101, criterio: 'igualitario' }], 0).map(
        (s) => s.taxaCentavos,
      ),
    ).toEqual([51, 50]);
  });
});
