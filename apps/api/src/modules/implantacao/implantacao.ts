import {
  IMPLANTACAO_PASSOS,
  nomeDoMes,
  type ImplantacaoDto,
  type ImplantacaoPasso,
  type ImplantacaoPassoDto,
} from '@condo/contracts';

/** O que se sabe do condomínio, reunido pelos serviços públicos de cada módulo. */
export interface ImplantacaoFatos {
  condominioId: string;
  unidades: number;
  blocos: string[];
  /** Provedor da conta de pagamentos ('fake', 'asaas'), ou nulo se não aberta. */
  provedor: string | null;
  /** Primeiro mês contábil (AAAA-MM-01), ou nulo se a contabilidade não começou. */
  primeiroMes: string | null;
  equipe: { papel: string; status: 'pendente' | 'aceito' }[];
  cobrancasEmitidas: number;
}

/** A primeira cobrança só pode sair com unidades, conta e contabilidade prontas. */
const PRE_REQUISITOS: Record<ImplantacaoPasso, ImplantacaoPasso[]> = {
  unidades: [],
  conta: [],
  contabilidade: [],
  equipe: [],
  cobranca: ['unidades', 'conta', 'contabilidade'],
};

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function lista(nomes: string[]): string {
  if (nomes.length <= 1) return nomes.join('');
  return `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`;
}

function resumoUnidades(f: ImplantacaoFatos): string {
  const unidades = plural(f.unidades, 'unidade', 'unidades');
  if (f.blocos.length === 0) return unidades;
  if (f.blocos.length <= 3) return `${unidades} em ${lista(f.blocos)}`;
  return `${unidades} em ${f.blocos.length} torres/blocos`;
}

function resumoEquipe(f: ImplantacaoFatos): string {
  const sindicos = f.equipe.filter((e) => e.papel === 'sindico').length;
  const conselheiros = f.equipe.filter((e) => e.papel === 'conselheiro').length;
  const pendentes = f.equipe.filter((e) => e.status === 'pendente').length;
  const partes = [
    sindicos > 0 && plural(sindicos, 'síndico', 'síndicos'),
    conselheiros > 0 && plural(conselheiros, 'conselheiro', 'conselheiros'),
  ].filter((x): x is string => Boolean(x));
  const pendencia =
    pendentes > 0 ? ` · ${plural(pendentes, 'convite pendente', 'convites pendentes')}` : '';
  return `${lista(partes)}${pendencia}`;
}

/**
 * Situação de cada passo. A equipe conta como feita quando há síndico convidado (o
 * conselho é recomendado, mas há condomínio sem conselho fiscal); convite pendente
 * aparece no resumo.
 */
export function implantacaoStatus(f: ImplantacaoFatos): ImplantacaoDto {
  const feito: Record<ImplantacaoPasso, boolean> = {
    unidades: f.unidades > 0,
    conta: f.provedor !== null,
    contabilidade: f.primeiroMes !== null,
    equipe: f.equipe.some((e) => e.papel === 'sindico'),
    cobranca: f.cobrancasEmitidas > 0,
  };
  const resumo: Record<ImplantacaoPasso, () => string> = {
    unidades: () => resumoUnidades(f),
    conta: () =>
      f.provedor === 'fake'
        ? 'Conta simulada aberta (homologação)'
        : 'Subconta do condomínio aberta',
    contabilidade: () => {
      const mes = f.primeiroMes ?? '';
      return `Começou em ${nomeDoMes(mes)} de ${mes.slice(0, 4)}`;
    },
    equipe: () => resumoEquipe(f),
    cobranca: () => plural(f.cobrancasEmitidas, 'cobrança emitida', 'cobranças emitidas'),
  };

  const passos: ImplantacaoPassoDto[] = IMPLANTACAO_PASSOS.map((chave) => ({
    chave,
    concluido: feito[chave],
    resumo: feito[chave] ? resumo[chave]() : null,
    bloqueadoPor: feito[chave] ? [] : PRE_REQUISITOS[chave].filter((p) => !feito[p]),
  }));
  const concluidos = passos.filter((p) => p.concluido).length;
  return {
    condominioId: f.condominioId,
    concluidos,
    total: passos.length,
    completo: concluidos === passos.length,
    passos,
  };
}
