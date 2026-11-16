/**
 * Implantação de um condomínio: os cinco passos para começar a cobrar. A Visão geral fica
 * em "modo implantação" enquanto algum passo estiver pendente.
 */
export const IMPLANTACAO_PASSOS = [
  'unidades',
  'conta',
  'contabilidade',
  'equipe',
  'cobranca',
] as const;

export type ImplantacaoPasso = (typeof IMPLANTACAO_PASSOS)[number];

export interface ImplantacaoPassoDto {
  chave: ImplantacaoPasso;
  concluido: boolean;
  /** Resumo do que já foi feito ("96 unidades em Torre A e Torre B"); nulo se pendente. */
  resumo: string | null;
  /** Passos que precisam estar concluídos antes deste (vazio = pode começar). */
  bloqueadoPor: ImplantacaoPasso[];
}

export interface ImplantacaoDto {
  condominioId: string;
  concluidos: number;
  total: number;
  /** Todos os passos concluídos: a Visão geral passa para o modo operação. */
  completo: boolean;
  passos: ImplantacaoPassoDto[];
}

/** Síndico ou conselheiro convidado para o condomínio. */
export interface StaffInviteDto {
  assignmentId: string;
  nome: string | null;
  email: string;
  papel: string;
  papelNome: string;
  /** Aceito = a pessoa já entrou e configurou a verificação em duas etapas. */
  status: 'pendente' | 'aceito';
  convidadoEm: string;
}
