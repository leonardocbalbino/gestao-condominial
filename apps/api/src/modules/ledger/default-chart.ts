import type { account } from '../../db/schema';

type ChartAccount = Pick<
  typeof account.$inferInsert,
  'codigo' | 'nome' | 'natureza' | 'grupo' | 'analitica' | 'caixa' | 'papelSistema'
>;

const synthetic = (codigo: string, nome: string, natureza: ChartAccount['natureza']) =>
  ({
    codigo,
    nome,
    natureza,
    grupo: null,
    analitica: false,
    caixa: false,
    papelSistema: null,
  }) as const;

const revenue = (
  codigo: string,
  nome: string,
  grupo: NonNullable<ChartAccount['grupo']>,
  papelSistema: ChartAccount['papelSistema'] = null,
): ChartAccount => ({
  codigo,
  nome,
  natureza: 'receita',
  grupo,
  analitica: true,
  caixa: false,
  papelSistema,
});

const expense = (
  codigo: string,
  nome: string,
  grupo: NonNullable<ChartAccount['grupo']> = 'ordinaria',
  papelSistema: ChartAccount['papelSistema'] = null,
): ChartAccount => ({
  codigo,
  nome,
  natureza: 'despesa',
  grupo,
  analitica: true,
  caixa: false,
  papelSistema,
});

/**
 * Plano de contas padrão para condomínios (decisão do produto). Vira o modelo da gestora
 * no primeiro uso; a gestora pode acrescentar contas, e cada condomínio recebe uma cópia.
 * Nomes em linguagem do dia a dia: aparecem na prestação de contas para o morador.
 */
export const DEFAULT_CHART: readonly ChartAccount[] = [
  synthetic('1', 'Ativo', 'ativo'),
  synthetic('1.1', 'Disponível', 'ativo'),
  {
    codigo: '1.1.01',
    nome: 'Conta de pagamentos do condomínio',
    natureza: 'ativo',
    grupo: null,
    analitica: true,
    caixa: true,
    papelSistema: 'banco',
  },
  {
    codigo: '1.1.02',
    nome: 'Aplicação do fundo de reserva',
    natureza: 'ativo',
    grupo: null,
    analitica: true,
    caixa: true,
    papelSistema: null,
  },
  synthetic('2', 'Patrimônio', 'patrimonio'),
  {
    codigo: '2.1',
    nome: 'Saldos iniciais',
    natureza: 'patrimonio',
    grupo: null,
    analitica: true,
    caixa: false,
    papelSistema: 'saldo_inicial',
  },
  synthetic('3', 'Receitas', 'receita'),
  synthetic('3.1', 'Receitas ordinárias', 'receita'),
  revenue('3.1.01', 'Taxa condominial', 'ordinaria', 'taxa_ordinaria'),
  revenue('3.1.02', 'Multas por atraso', 'ordinaria', 'multa'),
  revenue('3.1.03', 'Juros por atraso', 'ordinaria', 'juros'),
  revenue('3.1.04', 'Aluguel de vagas', 'ordinaria', 'aluguel_vaga'),
  revenue('3.1.05', 'Reserva de áreas comuns', 'ordinaria'),
  revenue('3.1.06', 'Rendimentos de aplicação', 'ordinaria'),
  revenue('3.1.99', 'Outras receitas', 'ordinaria'),
  synthetic('3.2', 'Fundo de reserva', 'receita'),
  revenue('3.2.01', 'Contribuição ao fundo de reserva', 'fundo_reserva', 'fundo_reserva'),
  synthetic('3.3', 'Obras', 'receita'),
  revenue('3.3.01', 'Taxa extra de obras', 'obras'),
  synthetic('4', 'Despesas', 'despesa'),
  synthetic('4.1', 'Pessoal', 'despesa'),
  expense('4.1.01', 'Salários'),
  expense('4.1.02', 'Encargos sociais (INSS e FGTS)'),
  expense('4.1.03', 'Benefícios (vale-transporte e refeição)'),
  expense('4.1.04', 'Férias e 13º salário'),
  synthetic('4.2', 'Consumo', 'despesa'),
  expense('4.2.01', 'Água e esgoto'),
  expense('4.2.02', 'Energia elétrica'),
  expense('4.2.03', 'Gás'),
  synthetic('4.3', 'Manutenção e serviços', 'despesa'),
  expense('4.3.01', 'Manutenção predial'),
  expense('4.3.02', 'Elevadores'),
  expense('4.3.03', 'Jardinagem'),
  expense('4.3.04', 'Limpeza e materiais'),
  expense('4.3.05', 'Portaria e segurança terceirizadas'),
  synthetic('4.4', 'Administração', 'despesa'),
  expense('4.4.01', 'Taxa de administração da gestora'),
  expense('4.4.02', 'Honorários contábeis e jurídicos'),
  expense('4.4.03', 'Material de escritório'),
  synthetic('4.5', 'Seguros', 'despesa'),
  expense('4.5.01', 'Seguro obrigatório da edificação'),
  synthetic('4.6', 'Impostos e taxas', 'despesa'),
  expense('4.6.01', 'Impostos e taxas'),
  synthetic('4.7', 'Despesas financeiras', 'despesa'),
  expense('4.7.01', 'Tarifas bancárias e de cobrança', 'ordinaria', 'tarifa_bancaria'),
  synthetic('4.8', 'Fundo de reserva', 'despesa'),
  expense('4.8.01', 'Despesas pagas pelo fundo de reserva', 'fundo_reserva'),
  synthetic('4.9', 'Obras', 'despesa'),
  expense('4.9.01', 'Despesas com obras', 'obras'),
];
