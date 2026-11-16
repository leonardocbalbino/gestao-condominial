import {
  formatBRL,
  formatDate,
  nomeDoMes,
  type BalanceteDto,
  type ChargeDto,
  type ImplantacaoDto,
  type InadimplenciaDto,
  type JournalEntryDto,
  type PayableDto,
  type PeriodDto,
  type PeriodStatus,
  type StaffInviteDto,
  type StatementLineDto,
  type UnitDto,
} from '@condo/contracts';
import { ChevronRight, Settings } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ImplantacaoChecklist } from '@/components/implantacao-checklist';
import { ButtonLink, Card, EmptyState, StatusChip, type ChipStatus } from '@/components/ui';
import { todayIso, todayMonth } from '@/lib/dates';
import { load } from '@/lib/load';

const statusChip: Record<PeriodStatus, ChipStatus> = {
  aberto: 'aberto',
  em_revisao: 'em_revisao',
  aprovado: 'aprovada',
  publicado: 'publicada',
};

const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);
const AGUARDANDO: PayableDto['status'][] = ['aguardando_aprovacao', 'aguardando_segunda_aprovacao'];
const EM_ABERTO: PayableDto['status'][] = [...AGUARDANDO, 'aprovada'];

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Visão geral em dois modos, decididos pela API (`/implantacao`): enquanto algum passo
 * estiver pendente, o checklist; depois, os números do dia a dia.
 */
export default async function VisaoGeralPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const status = await load<ImplantacaoDto>(`/condominios/${id}/implantacao`);

  if (status && !status.completo) {
    const invites = await load<StaffInviteDto[]>(`/condominios/${id}/staff-invites`);
    return (
      <div className="flex flex-col gap-6">
        <p className="max-w-2xl text-text-muted">
          Faltam {status.total - status.concluidos} passos para o condomínio começar a cobrar.
          Quando todos estiverem prontos, esta página passa a mostrar a arrecadação e as pendências
          do mês.
        </p>
        <ImplantacaoChecklist id={id} status={status} invites={invites} />
      </div>
    );
  }
  return <Operacao id={id} />;
}

function Kpi({ label, value, detail }: { label: string; value: ReactNode; detail: ReactNode }) {
  return (
    <Card className="p-5!">
      <p className="text-label font-medium text-text-muted">{label}</p>
      <div className="mt-1 text-page font-bold tracking-tight tabular-nums">{value}</div>
      <p className="mt-1 text-caption text-text-muted">{detail}</p>
    </Card>
  );
}

function Linha({ href, label, value }: { href: string; label: string; value: number | null }) {
  return (
    <li>
      <Link
        href={href}
        className="flex min-h-12 items-center gap-3 border-b border-divider py-2 last:border-0 hover:text-primary"
      >
        <span className="flex-1">{label}</span>
        <span
          className={`tabular-nums font-semibold ${value ? 'text-attention' : 'text-text-muted'}`}
          title={value === null ? 'A conciliação ainda não foi executada' : undefined}
        >
          {value === null ? '—' : value}
        </span>
        <ChevronRight aria-hidden size={18} className="text-text-muted" />
      </Link>
    </li>
  );
}

async function Operacao({ id }: { id: string }) {
  const base = `/condominios/${id}`;
  const mes = todayMonth();
  const hoje = todayIso();
  const [units, charges, atrasos, periods, linhas, payables] = await Promise.all([
    load<UnitDto[]>(`${base}/units`),
    load<ChargeDto[]>(`${base}/charges?competencia=${mes}`),
    load<InadimplenciaDto[]>(`${base}/charges/inadimplencia`),
    load<PeriodDto[]>(`${base}/ledger/periods`),
    load<StatementLineDto[]>(`${base}/reconciliation/lines`),
    load<PayableDto[]>(`${base}/payables`),
  ]);
  const periodo = periods?.find((p) => p.mes.startsWith(mes)) ?? null;
  const [balancete, lancamentos] = periodo
    ? await Promise.all([
        load<BalanceteDto>(`${base}/ledger/periods/${periodo.id}/balancete`),
        load<JournalEntryDto[]>(`${base}/ledger/periods/${periodo.id}/entries`),
      ])
    : [null, null];

  const emitidas = (charges ?? []).filter((c) => c.status !== 'cancelada');
  const previsto = emitidas.reduce((s, c) => s + c.valorCentavos, 0);
  const arrecadado = emitidas.reduce((s, c) => s + (c.valorPagoCentavos ?? 0), 0);
  const unidades = units?.length ?? 0;
  const emAtraso = atrasos ? new Set(atrasos.map((a) => a.unitId)).size : null;

  // Despesa sem comprovante: lançamento manual ou pagamento que debita conta de despesa
  // sem anexo (recebimentos trazem a tarifa do broker, comprovada pelo extrato).
  const despesas = new Set(
    (balancete?.linhas ?? []).filter((l) => l.natureza === 'despesa').map((l) => l.accountId),
  );
  const semComprovante = lancamentos
    ? lancamentos.filter(
        (e) =>
          (e.origem === 'manual' || e.origem === 'pagamento') &&
          !e.comprovanteId &&
          !e.estornadoPor &&
          e.linhas.some((l) => l.valorCentavos > 0 && despesas.has(l.accountId)),
      ).length
    : null;
  const conciliou = (linhas ?? []).length > 0;

  const limite = addDays(hoje, 30);
  const vencimentos = [
    ...Object.entries(
      emitidas
        .filter((c) => c.status === 'emitida' && c.vencimento >= hoje && c.vencimento <= limite)
        .reduce<Record<string, { n: number; total: number }>>((acc, c) => {
          const g = (acc[c.vencimento] ??= { n: 0, total: 0 });
          g.n += 1;
          g.total += c.valorCentavos;
          return acc;
        }, {}),
    ).map(([data, g]) => ({
      key: `c-${data}`,
      data,
      titulo: `${g.n} ${g.n === 1 ? 'cobrança' : 'cobranças'} de condomínio`,
      valor: g.total,
      href: `/painel/c/${id}/cobranca`,
    })),
    ...(payables ?? [])
      .filter((p) => EM_ABERTO.includes(p.status) && p.vencimento >= hoje && p.vencimento <= limite)
      .map((p) => ({
        key: `p-${p.id}`,
        data: p.vencimento,
        titulo: `Pagar ${p.fornecedor}`,
        valor: p.valorCentavos,
        href: `/painel/c/${id}/contas`,
      })),
  ].sort((a, b) => a.data.localeCompare(b.data));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-end">
        <ButtonLink href={`/painel/c/${id}/configuracoes`} variant="secondary" size="sm">
          <Settings aria-hidden size={16} /> Configurações do condomínio
        </ButtonLink>
      </div>

      <section aria-label="Indicadores" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi
          label="Arrecadado no mês"
          value={previsto > 0 ? `${pct(arrecadado, previsto)}%` : '—'}
          detail={
            previsto > 0
              ? `${formatBRL(arrecadado)} de ${formatBRL(previsto)}`
              : `Nenhuma cobrança em ${nomeDoMes(mes)}`
          }
        />
        <Kpi
          label="Inadimplência"
          value={emAtraso === null || unidades === 0 ? '—' : `${pct(emAtraso, unidades)}%`}
          detail={
            emAtraso === null
              ? 'Sem acesso à inadimplência'
              : `${emAtraso} de ${unidades} unidades em atraso`
          }
        />
        <Kpi
          label="Saldo da conta"
          value={balancete ? formatBRL(balancete.totais.caixaFinalCentavos) : '—'}
          detail={balancete ? `Caixa e banco em ${nomeDoMes(mes)}` : 'Mês ainda sem contabilidade'}
        />
        <Kpi
          label="Status do mês"
          value={periodo ? <StatusChip status={statusChip[periodo.status]} /> : '—'}
          detail={periodo ? `Prestação de ${nomeDoMes(mes)}` : 'Mês ainda não aberto'}
        />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Pendências">
          <ul>
            <Linha
              href={`/painel/c/${id}/contas`}
              label="Pagamentos aguardando aprovação"
              value={payables ? payables.filter((p) => AGUARDANDO.includes(p.status)).length : null}
            />
            <Linha
              href={`/painel/c/${id}/fechamento`}
              label="Despesas sem comprovante"
              value={semComprovante}
            />
            <Linha
              href={`/painel/c/${id}/conciliacao`}
              label="Exceções da conciliação"
              value={conciliou ? (linhas ?? []).filter((l) => l.status === 'excecao').length : null}
            />
          </ul>
        </Card>

        <Card title="Próximos vencimentos">
          {vencimentos.length === 0 ? (
            <EmptyState title="Nada vencendo nos próximos 30 dias">
              Cobranças emitidas e contas a pagar aparecem aqui conforme o vencimento se aproxima.
            </EmptyState>
          ) : (
            <ul>
              {vencimentos.slice(0, 8).map((v) => (
                <li key={v.key}>
                  <Link
                    href={v.href}
                    className="flex min-h-12 items-center gap-3 border-b border-divider py-2 last:border-0 hover:text-primary"
                  >
                    <span className="w-14 shrink-0 text-label font-semibold tabular-nums text-text-muted">
                      {formatDate(v.data).slice(0, 5)}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{v.titulo}</span>
                    <span className="tabular-nums">{formatBRL(v.valor)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
