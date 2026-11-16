import type { MyChargeDto } from '@condo/contracts';
import { describe, expect, it } from 'vitest';
import { pickPendencia } from './home.service';

const charge = (over: Partial<MyChargeDto>): MyChargeDto => ({
  id: 'x',
  unitId: 'u',
  unidade: '101',
  competencia: '2026-10',
  vencimento: '2026-10-10',
  valorCentavos: 100,
  status: 'emitida',
  linhaDigitavel: null,
  pixCopiaCola: null,
  boletoUrl: null,
  pagoEm: null,
  valorPagoCentavos: null,
  erroEmissao: null,
  itens: [],
  titulo: 'Sua taxa de outubro',
  atrasada: false,
  diasAtraso: 0,
  diasParaVencer: 0,
  valorAtualizadoCentavos: 100,
  ...over,
});

describe('pickPendencia', () => {
  it('a mais antiga em atraso vem antes de qualquer outra', () => {
    const atrasoNovo = charge({ id: 'b', vencimento: '2026-10-10', atrasada: true });
    const atrasoVelho = charge({ id: 'a', vencimento: '2026-09-10', atrasada: true });
    const proxima = charge({ id: 'c', vencimento: '2026-11-12' });
    expect(pickPendencia([proxima, atrasoNovo, atrasoVelho], '2026-11-05')?.id).toBe('a');
  });

  it('sem atraso: a próxima a vencer em até 15 dias', () => {
    const longe = charge({ id: 'longe', vencimento: '2026-12-10' });
    const perto = charge({ id: 'perto', vencimento: '2026-11-12' });
    expect(pickPendencia([longe, perto], '2026-11-05')?.id).toBe('perto');
    expect(pickPendencia([longe], '2026-11-05')).toBeNull();
  });

  it('pagas e canceladas não são pendência', () => {
    expect(
      pickPendencia(
        [charge({ status: 'paga', atrasada: false }), charge({ status: 'cancelada' })],
        '2026-10-09',
      ),
    ).toBeNull();
  });
});
