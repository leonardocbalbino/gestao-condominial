import { describe, expect, it } from 'vitest';
import { daysBetween, nomeDoMes, valorAtualizado } from './billing';
import { resolveCondominioConfig, updateCondominioConfigRequestSchema } from './org';

describe('valorAtualizado', () => {
  const base = {
    valorCentavos: 50_000,
    vencimento: '2026-10-10',
    multaBp: 200,
    jurosMensalBp: 100,
  };

  it('até o vencimento, valor original', () => {
    expect(valorAtualizado({ ...base, hoje: '2026-10-10' })).toEqual({
      multaCentavos: 0,
      jurosCentavos: 0,
      totalCentavos: 50_000,
      diasAtraso: 0,
    });
  });

  it('em atraso: multa de 2% + juros de 1% ao mês pro rata die', () => {
    // R$ 500,00, 15 dias: multa R$ 10,00; juros 500 × 1% × 15/30 = R$ 2,50.
    expect(valorAtualizado({ ...base, hoje: '2026-10-25' })).toEqual({
      multaCentavos: 1_000,
      jurosCentavos: 250,
      totalCentavos: 51_250,
      diasAtraso: 15,
    });
  });

  it('arredonda para o centavo mais próximo', () => {
    // 333,33 × 1% × 1/30 = 0,1111 → 0,11.
    expect(
      valorAtualizado({ ...base, valorCentavos: 33_333, hoje: '2026-10-11' }).jurosCentavos,
    ).toBe(11);
  });
});

describe('datas e meses', () => {
  it('conta dias atravessando a virada do ano e o horário de verão', () => {
    expect(daysBetween('2026-12-25', '2027-01-05')).toBe(11);
    expect(daysBetween('2026-10-31', '2026-11-02')).toBe(2);
  });

  it('nome do mês para "Sua taxa de outubro"', () => {
    expect(nomeDoMes('2026-10')).toBe('outubro');
    expect(nomeDoMes('2026-03-01')).toBe('março');
  });
});

describe('configuração do condomínio', () => {
  it('multa acima de 2% é recusada (Código Civil, art. 1.336, §1º)', () => {
    const res = updateCondominioConfigRequestSchema.safeParse({ cobranca: { multaBp: 1000 } });
    expect(res.success).toBe(false);
  });

  it('atualização parcial não traz padrões para os campos não enviados', () => {
    expect(updateCondominioConfigRequestSchema.parse({ cobranca: { multaBp: 100 } })).toEqual({
      cobranca: { multaBp: 100 },
    });
  });

  it('configuração gravada é completada com o padrão', () => {
    expect(resolveCondominioConfig({ cobranca: { fundoReservaBp: 500 } })).toEqual({
      cobranca: { diaVencimento: 10, multaBp: 200, jurosMensalBp: 100, fundoReservaBp: 500 },
      pagamentos: { limiteSegundaAprovacaoCentavos: 500_000 },
    });
  });
});
