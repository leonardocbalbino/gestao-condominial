import { describe, expect, it } from 'vitest';
import { implantacaoStatus, type ImplantacaoFatos } from './implantacao';

const vazio: ImplantacaoFatos = {
  condominioId: 'c1',
  unidades: 0,
  blocos: [],
  provedor: null,
  primeiroMes: null,
  equipe: [],
  cobrancasEmitidas: 0,
};

const pronto: ImplantacaoFatos = {
  ...vazio,
  unidades: 96,
  blocos: ['Torre A', 'Torre B'],
  provedor: 'fake',
  primeiroMes: '2026-11-01',
  equipe: [
    { papel: 'sindico', status: 'aceito' },
    { papel: 'conselheiro', status: 'pendente' },
  ],
  cobrancasEmitidas: 96,
};

describe('implantacaoStatus', () => {
  it('condomínio novo: 0 de 5, cobrança bloqueada por unidades, conta e contabilidade', () => {
    const s = implantacaoStatus(vazio);
    expect(s).toMatchObject({ concluidos: 0, total: 5, completo: false });
    expect(s.passos.map((p) => p.chave)).toEqual([
      'unidades',
      'conta',
      'contabilidade',
      'equipe',
      'cobranca',
    ]);
    expect(s.passos.find((p) => p.chave === 'cobranca')?.bloqueadoPor).toEqual([
      'unidades',
      'conta',
      'contabilidade',
    ]);
    expect(s.passos.every((p) => p.resumo === null)).toBe(true);
  });

  it('tudo feito: completo, com resumos legíveis', () => {
    const s = implantacaoStatus(pronto);
    expect(s).toMatchObject({ concluidos: 5, completo: true });
    const resumo = Object.fromEntries(s.passos.map((p) => [p.chave, p.resumo]));
    expect(resumo).toEqual({
      unidades: '96 unidades em Torre A e Torre B',
      conta: 'Conta simulada aberta (homologação)',
      contabilidade: 'Começou em novembro de 2026',
      equipe: '1 síndico e 1 conselheiro · 1 convite pendente',
      cobranca: '96 cobranças emitidas',
    });
  });

  it('só conselheiro não conclui a equipe; síndico pendente conclui', () => {
    const soConselho = implantacaoStatus({
      ...vazio,
      equipe: [{ papel: 'conselheiro', status: 'aceito' }],
    });
    expect(soConselho.passos.find((p) => p.chave === 'equipe')?.concluido).toBe(false);
    const sindicoPendente = implantacaoStatus({
      ...vazio,
      equipe: [{ papel: 'sindico', status: 'pendente' }],
    });
    expect(sindicoPendente.passos.find((p) => p.chave === 'equipe')?.concluido).toBe(true);
  });

  it('cobrança libera quando unidades, conta e contabilidade estão prontas', () => {
    const s = implantacaoStatus({ ...pronto, cobrancasEmitidas: 0, equipe: [] });
    const cobranca = s.passos.find((p) => p.chave === 'cobranca');
    expect(cobranca).toMatchObject({ concluido: false, bloqueadoPor: [] });
    expect(s.completo).toBe(false);
  });

  it('muitos blocos: resume pela quantidade', () => {
    const s = implantacaoStatus({ ...pronto, blocos: ['A', 'B', 'C', 'D'] });
    expect(s.passos[0]?.resumo).toBe('96 unidades em 4 torres/blocos');
  });
});
