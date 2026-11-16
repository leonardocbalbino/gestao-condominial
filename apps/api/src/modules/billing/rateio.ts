import type { RateioCriterio } from '@condo/contracts';

/** Fração ideal guardada como numeric(12,10): vira inteiro em 1e-10 (sem float). */
const FRACAO_SCALE = 10;

export function parseFracao(value: string): bigint {
  const [int = '0', dec = ''] = value.split('.');
  return BigInt(int + dec.padEnd(FRACAO_SCALE, '0').slice(0, FRACAO_SCALE));
}

/**
 * Divide `total` centavos proporcionalmente aos pesos pelo método do maior resto:
 * cada parte recebe o piso da sua cota exata, e os centavos que sobram vão, um a um,
 * para as maiores frações descartadas (empate: ordem de entrada). A soma é sempre `total`.
 */
export function splitLargestRemainder(total: number, weights: readonly bigint[]): number[] {
  if (!Number.isSafeInteger(total) || total < 0) throw new Error('Total inválido');
  const sumWeights = weights.reduce((acc, w) => acc + w, 0n);
  if (weights.length === 0 || sumWeights <= 0n) throw new Error('Pesos inválidos');
  if (weights.some((w) => w < 0n)) throw new Error('Peso negativo');

  const t = BigInt(total);
  const floors = weights.map((w) => (t * w) / sumWeights);
  const remainders = weights.map((w) => (t * w) % sumWeights);
  let leftover = t - floors.reduce((acc, f) => acc + f, 0n);

  const order = remainders
    .map((r, i) => ({ r, i }))
    .sort((a, b) => (a.r === b.r ? a.i - b.i : a.r > b.r ? -1 : 1));
  const result = floors.map(Number);
  for (const { i } of order) {
    if (leftover === 0n) break;
    result[i] = (result[i] ?? 0) + 1;
    leftover -= 1n;
  }
  return result;
}

export interface RateioUnit {
  id: string;
  fracaoIdeal: string | null;
}

export interface RateioLine {
  valorCentavos: number;
  criterio: RateioCriterio;
}

export interface RateioShare {
  unitId: string;
  taxaCentavos: number;
  fundoReservaCentavos: number;
}

/**
 * Rateio mensal: cada linha do orçamento é dividida pelo seu critério (fração ideal ou
 * igualitário; "misto" = linhas com critérios diferentes). O fundo de reserva é um
 * percentual sobre a taxa ordinária, distribuído na proporção da taxa de cada unidade.
 */
export function computeRateio(
  units: readonly RateioUnit[],
  lines: readonly RateioLine[],
  fundoReservaBp: number,
): RateioShare[] {
  if (units.length === 0) throw new Error('Condomínio sem unidades');
  const needsFracao = lines.some((l) => l.criterio === 'fracao_ideal');
  if (needsFracao && units.some((u) => !u.fracaoIdeal)) {
    throw new Error('Há unidades sem fração ideal');
  }

  const taxa = units.map(() => 0);
  for (const line of lines) {
    const weights = units.map((u) =>
      line.criterio === 'igualitario' ? 1n : parseFracao(u.fracaoIdeal ?? '0'),
    );
    splitLargestRemainder(line.valorCentavos, weights).forEach((v, i) => {
      taxa[i] = (taxa[i] ?? 0) + v;
    });
  }

  const totalTaxa = taxa.reduce((acc, v) => acc + v, 0);
  // Arredondamento comercial do total do fundo; depois, maior resto entre as unidades.
  const totalFundo = Number((BigInt(totalTaxa) * BigInt(fundoReservaBp) + 5_000n) / 10_000n);
  const fundo =
    totalTaxa > 0 ? splitLargestRemainder(totalFundo, taxa.map(BigInt)) : units.map(() => 0);

  return units.map((u, i) => ({
    unitId: u.id,
    taxaCentavos: taxa[i] ?? 0,
    fundoReservaCentavos: fundo[i] ?? 0,
  }));
}
