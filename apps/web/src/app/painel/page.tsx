import {
  formatBRL,
  formatDate,
  nomeDoMes,
  type ChargeDto,
  type CondominioDto,
  type InadimplenciaDto,
  type PayableDto,
  type PeriodDto,
  type PeriodStatus,
  type StatementLineDto,
  type UnitDto,
} from '@condo/contracts';
import { ChevronRight, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { Badge, ButtonLink, Card, EmptyState, Field } from '@/components/ui';
import { api } from '@/lib/api';
import { staffContext } from '@/lib/context';
import { todayMonth } from '@/lib/dates';
import { load } from '@/lib/load';
import { createCondominioAction } from './actions';

function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

const prestacao: Record<
  PeriodStatus,
  { label: string; tone: 'neutral' | 'info' | 'success' | 'warning' }
> = {
  aberto: { label: 'Em aberto', tone: 'warning' },
  em_revisao: { label: 'Em revisão', tone: 'info' },
  aprovado: { label: 'Aprovada', tone: 'info' },
  publicado: { label: 'Publicada', tone: 'success' },
};

const AGUARDANDO: PayableDto['status'][] = ['aguardando_aprovacao', 'aguardando_segunda_aprovacao'];

/**
 * Números de um condomínio para a visão consolidada. Cada fonte que a pessoa não pode
 * ver (403) ou que ainda não existe (404) vira vazio: a tela mostra só o que cabe a ela.
 */
async function resumo(c: CondominioDto, mes: string, mesAnterior: string) {
  const base = `/condominios/${c.id}`;
  const [units, charges, atrasos, periods, excecoes, payables] = await Promise.all([
    load<UnitDto[]>(`${base}/units`),
    load<ChargeDto[]>(`${base}/charges?competencia=${mes}`),
    load<InadimplenciaDto[]>(`${base}/charges/inadimplencia`),
    load<PeriodDto[]>(`${base}/ledger/periods`),
    load<StatementLineDto[]>(`${base}/reconciliation/lines?status=excecao`),
    load<PayableDto[]>(`${base}/payables`),
  ]);
  const emitidas = (charges ?? []).filter((x) => x.status !== 'cancelada');
  const unidades = units?.length ?? 0;
  return {
    condo: c,
    unidades,
    previstoCentavos: emitidas.reduce((s, x) => s + x.valorCentavos, 0),
    arrecadadoCentavos: emitidas.reduce((s, x) => s + (x.valorPagoCentavos ?? 0), 0),
    unidadesEmAtraso: new Set((atrasos ?? []).map((a) => a.unitId)).size,
    emAtrasoCentavos: (atrasos ?? []).reduce((s, a) => s + a.valorAtualizadoCentavos, 0),
    prestacao: periods?.find((p) => p.mes.startsWith(mesAnterior))?.status ?? null,
    excecoes: excecoes ?? [],
    aprovacoes: (payables ?? []).filter((p) => AGUARDANDO.includes(p.status)),
  };
}

function Kpi({ label, value, detail }: { label: string; value: ReactNode; detail: ReactNode }) {
  return (
    <Card>
      <p className="text-sm font-semibold text-text-muted">{label}</p>
      <p className="mt-1 text-3xl font-extrabold tracking-tight tabular-nums">{value}</p>
      <p className="mt-1 text-sm text-text-muted">{detail}</p>
    </Card>
  );
}

function Barra({ value }: { value: number }) {
  return (
    <span
      aria-hidden
      className="mt-1 block h-2 w-full max-w-36 overflow-hidden rounded-full bg-divider"
    >
      <span
        className="block h-full rounded-full bg-success"
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </span>
  );
}

/** Visão consolidada da gestora (layout aprovado): indicadores, carteira e fila de exceções. */
export default async function PainelPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { gestora } = await staffContext();
  const q = ((await searchParams).q ?? '').trim();
  const todos = await api<CondominioDto[]>('/condominios', { gestoraId: gestora.id });
  const isAdmin = gestora.roles.some((r) => r.key === 'gestora_admin');
  const mes = todayMonth();
  const mesAnterior = previousMonth(mes);

  const resumos = await Promise.all(todos.map((c) => resumo(c, mes, mesAnterior)));
  const visiveis = q
    ? resumos.filter((r) =>
        r.condo.nome.toLocaleLowerCase('pt-BR').includes(q.toLocaleLowerCase('pt-BR')),
      )
    : resumos;

  const total = (f: (r: (typeof resumos)[number]) => number) =>
    resumos.reduce((s, r) => s + f(r), 0);
  const unidades = total((r) => r.unidades);
  const previsto = total((r) => r.previstoCentavos);
  const arrecadado = total((r) => r.arrecadadoCentavos);
  const comUnidades = resumos.filter((r) => r.unidades > 0);
  const inadimplenciaMedia = comUnidades.length
    ? Math.round(
        comUnidades.reduce((s, r) => s + pct(r.unidadesEmAtraso, r.unidades), 0) /
          comUnidades.length,
      )
    : 0;
  const publicadas = resumos.filter((r) => r.prestacao === 'publicado').length;

  const fila = resumos.flatMap((r) => [
    ...r.excecoes.map((e) => ({
      key: e.id,
      condo: r.condo,
      titulo: e.motivo ?? 'Lançamento do extrato sem par',
      detalhe: `${e.descricao} · ${formatBRL(e.valorCentavos)} · ${formatDate(e.data)}`,
      href: `/painel/c/${r.condo.id}/conciliacao`,
    })),
    ...r.aprovacoes.map((p) => ({
      key: p.id,
      condo: r.condo,
      titulo:
        p.status === 'aguardando_segunda_aprovacao'
          ? 'Conta aguarda 2ª assinatura'
          : 'Conta aguarda aprovação',
      detalhe: `${p.fornecedor} · ${formatBRL(p.valorCentavos)} · vence ${formatDate(p.vencimento)}`,
      href: `/painel/c/${r.condo.id}/contas`,
    })),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Condomínios</h1>
          <p className="mt-1 text-text-muted">
            Visão consolidada · {nomeDoMes(mes)} de {mes.slice(0, 4)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <form role="search" className="relative">
            <label htmlFor="busca" className="sr-only">
              Buscar condomínio
            </label>
            <Search
              aria-hidden
              size={20}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              id="busca"
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Buscar condomínio"
              className="min-h-13 w-64 max-w-full rounded-xl border-2 border-border bg-surface pl-10 pr-3"
            />
          </form>
          {isAdmin && (
            <ButtonLink href="#novo">
              <Plus aria-hidden /> Novo condomínio
            </ButtonLink>
          )}
        </div>
      </header>

      <section aria-label="Indicadores" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Condomínios" value={todos.length} detail={`${unidades} unidades`} />
        <Kpi
          label="Arrecadado no mês"
          value={`${pct(arrecadado, previsto)}%`}
          detail={`${formatBRL(arrecadado)} de ${formatBRL(previsto)}`}
        />
        <Kpi
          label="Inadimplência média"
          value={`${inadimplenciaMedia}%`}
          detail={`${formatBRL(total((r) => r.emAtrasoCentavos))} em atraso`}
        />
        <Kpi
          label="Prestações publicadas"
          value={`${publicadas} de ${todos.length}`}
          detail={`Mês de ${nomeDoMes(mesAnterior)}`}
        />
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <section aria-labelledby="carteira">
          <h2 id="carteira" className="sr-only">
            Carteira
          </h2>
          {visiveis.length === 0 ? (
            <EmptyState>
              {q ? `Nenhum condomínio com “${q}”.` : 'Nenhum condomínio por aqui ainda.'}
            </EmptyState>
          ) : (
            <CarteiraTabela linhas={visiveis} />
          )}
        </section>

        <section aria-labelledby="fila">
          <Card className="p-0">
            <h2
              id="fila"
              className="flex items-center justify-between border-b border-divider px-5 py-4 text-lg font-bold"
            >
              Fila de exceções
              {fila.length > 0 && <Badge tone="warning">{fila.length}</Badge>}
            </h2>
            {fila.length === 0 ? (
              <p className="px-5 py-6 text-text-muted">
                Nada pendente. Tudo conciliado e aprovado.
              </p>
            ) : (
              <ul>
                {fila.slice(0, 8).map((item) => (
                  <li key={item.key} className="border-b border-divider px-5 py-4 last:border-0">
                    <p className="text-sm font-semibold text-text-muted">{item.condo.nome}</p>
                    <p className="font-bold">{item.titulo}</p>
                    <p className="text-sm text-text-muted">{item.detalhe}</p>
                    <Link
                      href={item.href}
                      className="touch mt-1 inline-flex items-center gap-1 font-bold text-primary hover:underline"
                    >
                      Resolver <ChevronRight aria-hidden size={18} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      </div>

      {isAdmin && (
        <Card className="max-w-lg scroll-mt-6">
          <h2 id="novo" className="mb-4 flex scroll-mt-6 items-center gap-2 text-xl font-bold">
            <Plus aria-hidden /> Novo condomínio
          </h2>
          <ActionForm action={createCondominioAction}>
            <Field label="Nome" name="nome" required minLength={2} />
            <Field label="CNPJ" name="cnpj" inputMode="numeric" required />
            <SubmitButton>
              <Plus aria-hidden /> Criar condomínio
            </SubmitButton>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}

type Linha = Awaited<ReturnType<typeof resumo>>;

/** Tabela no desktop; cartões no celular (§7: "tabelas viram cartões"). */
function CarteiraTabela({ linhas }: { linhas: Linha[] }) {
  const celulas = (r: Linha) => {
    const arrec = pct(r.arrecadadoCentavos, r.previstoCentavos);
    const inad = pct(r.unidadesEmAtraso, r.unidades);
    const pend = r.excecoes.length + r.aprovacoes.length;
    const status = r.prestacao ? prestacao[r.prestacao] : null;
    return {
      nome: (
        <Link
          href={`/painel/c/${r.condo.id}`}
          className="touch inline-flex items-center font-bold text-text hover:text-primary hover:underline"
        >
          {r.condo.nome}
        </Link>
      ),
      unidades: r.unidades,
      arrecadado:
        r.previstoCentavos > 0 ? (
          <>
            <span className="font-semibold tabular-nums">{arrec}%</span>
            <span className="ml-2 text-sm text-text-muted tabular-nums">
              {formatBRL(r.arrecadadoCentavos)}
            </span>
            <Barra value={arrec} />
          </>
        ) : (
          <span className="text-text-muted">Sem cobrança no mês</span>
        ),
      inadimplencia: (
        <span className={`font-semibold tabular-nums ${inad >= 10 ? 'text-attention' : ''}`}>
          {inad}%
        </span>
      ),
      prestacao: status ? (
        <Badge tone={status.tone}>{status.label}</Badge>
      ) : (
        <span className="text-text-muted">—</span>
      ),
      pendencias:
        pend > 0 ? (
          <Badge tone="warning">{pend}</Badge>
        ) : (
          <span className="text-text-muted">Nenhuma</span>
        ),
    };
  };

  const colunas = [
    ['nome', 'Condomínio'],
    ['unidades', 'Unidades'],
    ['arrecadado', 'Arrecadado no mês'],
    ['inadimplencia', 'Inadimplência'],
    ['prestacao', 'Prestação'],
    ['pendencias', 'Pendências'],
  ] as const;

  return (
    <>
      <ul className="flex flex-col gap-3 md:hidden">
        {linhas.map((r) => {
          const cel = celulas(r);
          return (
            <li key={r.condo.id} className="rounded-2xl border border-divider bg-surface p-4">
              <div className="mb-2 text-lg">{cel.nome}</div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
                {colunas.slice(1).map(([k, label]) => (
                  <div key={k} className="contents">
                    <dt className="text-text-muted">{label}</dt>
                    <dd className="text-right">{cel[k]}</dd>
                  </div>
                ))}
              </dl>
            </li>
          );
        })}
      </ul>
      <div className="hidden overflow-hidden rounded-2xl border border-divider bg-surface md:block">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-divider bg-background text-left text-sm text-text-muted">
              {colunas.map(([k, label]) => (
                <th key={k} scope="col" className="px-4 py-3 font-semibold">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((r) => {
              const cel = celulas(r);
              return (
                <tr key={r.condo.id} className="border-b border-divider last:border-0">
                  {colunas.map(([k]) => (
                    <td key={k} className="px-4 py-3 align-middle">
                      {cel[k]}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
