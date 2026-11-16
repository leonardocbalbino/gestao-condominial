import {
  formatBRL,
  formatDate,
  nomeDoMes,
  type ChargeDto,
  type CondominioDto,
  type InadimplenciaDto,
  type PayableDto,
  type PaymentAccountDto,
  type PeriodDto,
  type PeriodStatus,
  type StatementLineDto,
  type UnitDto,
} from '@condo/contracts';
import { ChevronRight, Plus, Scale, Search, Settings } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { CnpjField } from '@/components/cnpj-field';
import { DialogClose, Modal } from '@/components/dialog';
import {
  Badge,
  ButtonLink,
  Card,
  EmptyState,
  Field,
  PageHeader,
  StatusChip,
  type ChipStatus,
} from '@/components/ui';
import { staffCondominios, staffContext } from '@/lib/context';
import { todayMonth } from '@/lib/dates';
import { load } from '@/lib/load';
import { createCondominioAction } from './actions';

function previousMonth(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);

const prestacaoChip: Record<PeriodStatus, ChipStatus> = {
  aberto: 'aberto',
  em_revisao: 'em_revisao',
  aprovado: 'aprovada',
  publicado: 'publicada',
};

const AGUARDANDO: PayableDto['status'][] = ['aguardando_aprovacao', 'aguardando_segunda_aprovacao'];

/** "—" com explicação ao passar o mouse: ausência de dado nunca vira zero. */
function SemDado({ motivo }: { motivo: string }) {
  return (
    <span title={motivo} className="text-text-muted">
      —<span className="sr-only"> ({motivo})</span>
    </span>
  );
}

/**
 * Números de um condomínio. Fonte que a pessoa não pode ver (403) ou que ainda não
 * existe (404) vira `null` e aparece como "—", nunca como zero.
 */
async function resumo(c: CondominioDto, mes: string, mesAnterior: string) {
  const base = `/condominios/${c.id}`;
  const [units, account, charges, atrasos, periods, linhas, payables] = await Promise.all([
    load<UnitDto[]>(`${base}/units`),
    load<PaymentAccountDto>(`${base}/billing/account`),
    load<ChargeDto[]>(`${base}/charges?competencia=${mes}`),
    load<InadimplenciaDto[]>(`${base}/charges/inadimplencia`),
    load<PeriodDto[]>(`${base}/ledger/periods`),
    load<StatementLineDto[]>(`${base}/reconciliation/lines`),
    load<PayableDto[]>(`${base}/payables`),
  ]);
  const unidades = units?.length ?? 0;
  // Passos da implantação ainda pendentes (a Etapa 4 traz isso da API).
  const faltando = [
    unidades === 0 && 'unidades',
    !account && 'conta de pagamentos',
    (periods ?? []).length === 0 && 'contabilidade',
  ].filter((x): x is string => Boolean(x));
  const emitidas = (charges ?? []).filter((x) => x.status !== 'cancelada');
  return {
    condo: c,
    unidades,
    faltando,
    previstoCentavos: emitidas.reduce((s, x) => s + x.valorCentavos, 0),
    arrecadadoCentavos: emitidas.reduce((s, x) => s + (x.valorPagoCentavos ?? 0), 0),
    unidadesEmAtraso: atrasos ? new Set(atrasos.map((a) => a.unitId)).size : null,
    emAtrasoCentavos: (atrasos ?? []).reduce((s, a) => s + a.valorAtualizadoCentavos, 0),
    prestacao: periods?.find((p) => p.mes.startsWith(mesAnterior))?.status ?? null,
    /** Houve extrato importado (a conciliação já rodou ao menos uma vez). */
    conciliou: (linhas ?? []).length > 0,
    excecoes: (linhas ?? []).filter((l) => l.status === 'excecao'),
    aprovacoes: (payables ?? []).filter((p) => AGUARDANDO.includes(p.status)),
  };
}

type Linha = Awaited<ReturnType<typeof resumo>>;

function Kpi({
  label,
  value,
  detail,
  href,
}: {
  label: string;
  value: ReactNode;
  detail: ReactNode;
  href?: string;
}) {
  const body = (
    <>
      <p className="text-label font-medium text-text-muted">{label}</p>
      <p className="mt-1 text-page font-bold tracking-tight tabular-nums">{value}</p>
      <p className="mt-1 text-caption text-text-muted">{detail}</p>
    </>
  );
  return (
    <Card className="p-5!">
      {href ? (
        <Link href={href} className="block rounded-md hover:text-primary">
          {body}
        </Link>
      ) : (
        body
      )}
    </Card>
  );
}

function Barra({ value }: { value: number }) {
  return (
    <span aria-hidden className="block h-1.5 w-28 overflow-hidden rounded-full bg-divider">
      <span
        className="block h-full rounded-full bg-success"
        style={{ width: `${Math.min(100, value)}%` }}
      />
    </span>
  );
}

/** Visão consolidada da gestora: indicadores, carteira e fila de exceções. */
export default async function PainelPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { gestora } = await staffContext();
  const q = ((await searchParams).q ?? '').trim();
  const todos = await staffCondominios();
  const isAdmin = gestora.roles.some((r) => r.key === 'gestora_admin');
  const mes = todayMonth();
  const mesAnterior = previousMonth(mes);

  const resumos = await Promise.all(todos.map((c) => resumo(c, mes, mesAnterior)));
  const busca = q.toLocaleLowerCase('pt-BR');
  const visiveis = q
    ? resumos.filter((r) => r.condo.nome.toLocaleLowerCase('pt-BR').includes(busca))
    : resumos;

  const sum = (rs: Linha[], f: (r: Linha) => number) => rs.reduce((s, r) => s + f(r), 0);
  const unidades = sum(resumos, (r) => r.unidades);
  const implantando = resumos.filter((r) => r.faltando.length > 0).length;
  const previsto = sum(resumos, (r) => r.previstoCentavos);
  const arrecadado = sum(resumos, (r) => r.arrecadadoCentavos);
  const comInadimplencia = resumos.filter((r) => r.unidades > 0 && r.unidadesEmAtraso !== null);
  const inadimplenciaMedia = comInadimplencia.length
    ? Math.round(
        sum(comInadimplencia, (r) => pct(r.unidadesEmAtraso ?? 0, r.unidades)) /
          comInadimplencia.length,
      )
    : null;
  const comPrestacao = resumos.filter((r) => r.prestacao !== null);
  const publicadas = comPrestacao.filter((r) => r.prestacao === 'publicado').length;
  const algumaConciliacao = resumos.some((r) => r.conciliou);

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
      <PageHeader
        title="Condomínios"
        subtitle={`Visão consolidada · ${nomeDoMes(mes)} de ${mes.slice(0, 4)}`}
        action={
          <>
            <form role="search" className="relative">
              <label htmlFor="busca" className="sr-only">
                Buscar condomínio
              </label>
              <Search
                aria-hidden
                size={18}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
              />
              <input
                id="busca"
                name="q"
                type="search"
                defaultValue={q}
                placeholder="Buscar condomínio"
                className="h-11 w-60 max-w-full rounded-(--radius-control) border border-border bg-surface pl-9 pr-3"
              />
            </form>
            {isAdmin && (
              <Modal
                trigger={
                  <>
                    <Plus aria-hidden size={18} /> Novo condomínio
                  </>
                }
                triggerStyle={{ variant: 'primary' }}
                title="Novo condomínio"
                description="Comece pelo nome e CNPJ. Torres, unidades e conta de pagamentos se configuram em seguida."
              >
                <ActionForm action={createCondominioAction} className="flex flex-col gap-4">
                  <Field label="Nome" name="nome" required minLength={2} autoComplete="off" />
                  <CnpjField />
                  <div className="mt-2 flex justify-end gap-2">
                    <DialogClose>Cancelar</DialogClose>
                    <SubmitButton>Criar condomínio</SubmitButton>
                  </div>
                </ActionForm>
              </Modal>
            )}
          </>
        }
      />

      <section
        aria-label="Indicadores"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
      >
        <Kpi
          label="Condomínios"
          value={todos.length}
          detail={`${unidades} unidades${implantando > 0 ? ` · ${implantando} em implantação` : ''}`}
        />
        <Kpi
          label="Arrecadado no mês"
          value={previsto > 0 ? `${pct(arrecadado, previsto)}%` : '—'}
          detail={
            previsto > 0
              ? `${formatBRL(arrecadado)} de ${formatBRL(previsto)}`
              : `Nenhuma cobrança emitida em ${nomeDoMes(mes)}`
          }
        />
        <Kpi
          label="Inadimplência média"
          value={inadimplenciaMedia === null ? '—' : `${inadimplenciaMedia}%`}
          detail={
            inadimplenciaMedia === null
              ? 'Nenhum condomínio com unidades'
              : `${formatBRL(sum(resumos, (r) => r.emAtrasoCentavos))} em atraso`
          }
        />
        <Kpi
          label="Prestações publicadas"
          value={comPrestacao.length ? `${publicadas} de ${comPrestacao.length}` : '—'}
          detail={
            comPrestacao.length
              ? `Mês de ${nomeDoMes(mesAnterior)}`
              : `Nenhuma contabilidade com ${nomeDoMes(mesAnterior)}`
          }
        />
        <Kpi
          label="Fila de exceções"
          value={fila.length > 0 || algumaConciliacao ? fila.length : '—'}
          detail={
            fila.length > 0
              ? 'Itens esperando ação'
              : algumaConciliacao
                ? 'Nada pendente'
                : 'Nenhuma conciliação ainda'
          }
          href="#fila"
        />
      </section>

      <section aria-labelledby="carteira">
        <h2 id="carteira" className="sr-only">
          Carteira de condomínios
        </h2>
        {visiveis.length === 0 ? (
          <EmptyState
            title={q ? 'Nenhum condomínio encontrado' : 'Nenhum condomínio ainda'}
            action={
              q ? (
                <ButtonLink href="/painel" variant="secondary">
                  Limpar busca
                </ButtonLink>
              ) : undefined
            }
          >
            {q
              ? `Nenhum nome contém “${q}”.`
              : 'Cadastre o primeiro condomínio da carteira pelo botão “Novo condomínio”.'}
          </EmptyState>
        ) : (
          <CarteiraTabela linhas={visiveis} mes={mes} mesAnterior={mesAnterior} />
        )}
      </section>

      <section id="fila" aria-labelledby="fila-titulo" className="scroll-mt-20">
        <Card
          title={
            <span id="fila-titulo" className="flex items-center gap-2">
              Fila de exceções {fila.length > 0 && <Badge tone="warning">{fila.length}</Badge>}
            </span>
          }
          className="p-0! [&>header]:mb-0 [&>header]:border-b [&>header]:border-divider [&>header]:px-6 [&>header]:py-4"
        >
          {fila.length > 0 ? (
            <ul>
              {fila.map((item) => (
                <li
                  key={item.key}
                  className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-divider px-6 py-4 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-caption text-text-muted">{item.condo.nome}</p>
                    <p className="font-semibold">{item.titulo}</p>
                    <p className="text-label text-text-muted">{item.detalhe}</p>
                  </div>
                  <ButtonLink href={item.href} variant="secondary" size="sm">
                    Resolver <ChevronRight aria-hidden size={16} />
                  </ButtonLink>
                </li>
              ))}
            </ul>
          ) : algumaConciliacao ? (
            <p className="px-6 py-6 text-text-muted">
              Nada pendente: as conciliações executadas não têm divergência e não há contas
              esperando aprovação.
            </p>
          ) : (
            <div className="p-4">
              <EmptyState icon={Scale} title="Ainda não há conciliações">
                Elas aparecem aqui depois que a conta de pagamentos de um condomínio for conectada.
              </EmptyState>
            </div>
          )}
        </Card>
      </section>
    </div>
  );
}

/** Tabela em largura total no desktop; cartões no celular (§7). Nada quebra em duas linhas. */
function CarteiraTabela({
  linhas,
  mes,
  mesAnterior,
}: {
  linhas: Linha[];
  mes: string;
  mesAnterior: string;
}) {
  const configurar = (r: Linha) => (
    <ButtonLink href={`/painel/c/${r.condo.id}`} variant="secondary" size="sm">
      <Settings aria-hidden size={16} /> Configurar
    </ButtonLink>
  );
  const implantacao = (r: Linha) => (
    <StatusChip status="em_implantacao" title={`Falta: ${r.faltando.join(', ')}`} />
  );

  const celulas = (r: Linha) => {
    const arrec = pct(r.arrecadadoCentavos, r.previstoCentavos);
    const pend = r.excecoes.length + r.aprovacoes.length;
    return {
      unidades: <span className="tabular-nums">{r.unidades}</span>,
      arrecadado:
        r.previstoCentavos > 0 ? (
          <span className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1 md:justify-start">
            <span className="font-semibold tabular-nums">{arrec}%</span>
            <Barra value={arrec} />
            <span className="whitespace-nowrap text-label text-text-muted tabular-nums">
              {formatBRL(r.arrecadadoCentavos)}
            </span>
          </span>
        ) : (
          <StatusChip
            status="sem_cobranca"
            title={`Nenhuma cobrança emitida em ${nomeDoMes(mes)}`}
          />
        ),
      inadimplencia:
        r.unidadesEmAtraso === null ? (
          <SemDado motivo="Sem acesso à inadimplência deste condomínio" />
        ) : (
          <span
            className={`font-semibold tabular-nums ${pct(r.unidadesEmAtraso, r.unidades) >= 10 ? 'text-attention' : ''}`}
          >
            {pct(r.unidadesEmAtraso, r.unidades)}%
          </span>
        ),
      prestacao: r.prestacao ? (
        <StatusChip status={prestacaoChip[r.prestacao]} />
      ) : (
        <SemDado motivo={`A contabilidade ainda não tem o mês de ${nomeDoMes(mesAnterior)}`} />
      ),
      pendencias:
        pend > 0 ? (
          <Badge tone="warning">
            {pend} {pend === 1 ? 'item' : 'itens'}
          </Badge>
        ) : r.conciliou ? (
          <span className="text-text-muted">Nenhuma</span>
        ) : (
          <SemDado motivo="A conciliação ainda não foi executada" />
        ),
    };
  };

  const colunas = [
    ['unidades', 'Unidades'],
    ['arrecadado', 'Arrecadado no mês'],
    ['inadimplencia', 'Inadimplência'],
    ['prestacao', 'Prestação'],
    ['pendencias', 'Pendências'],
  ] as const;

  const nome = (r: Linha) => (
    <Link
      href={`/painel/c/${r.condo.id}`}
      className="font-semibold text-text hover:text-primary hover:underline"
    >
      {r.condo.nome}
    </Link>
  );

  return (
    <>
      <ul className="flex flex-col gap-3 md:hidden">
        {linhas.map((r) => (
          <li
            key={r.condo.id}
            className="rounded-(--radius-card) border border-divider bg-surface p-4 shadow-card"
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              {nome(r)}
              {r.faltando.length > 0 && implantacao(r)}
            </div>
            {r.faltando.length > 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-label text-text-muted">Falta: {r.faltando.join(', ')}.</p>
                {configurar(r)}
              </div>
            ) : (
              <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2">
                {colunas.map(([k, label]) => (
                  <div key={k} className="contents">
                    <dt className="text-label text-text-muted">{label}</dt>
                    <dd className="flex min-w-0 justify-end text-right">{celulas(r)[k]}</dd>
                  </div>
                ))}
              </dl>
            )}
          </li>
        ))}
      </ul>

      <div className="hidden overflow-x-auto rounded-(--radius-card) border border-divider bg-surface shadow-card md:block">
        <table className="w-full border-collapse whitespace-nowrap">
          <thead>
            <tr className="border-b border-divider bg-background text-left text-label text-text-muted">
              <th scope="col" className="px-4 py-3 font-semibold">
                Condomínio
              </th>
              {colunas.map(([k, label]) => (
                <th key={k} scope="col" className="px-4 py-3 font-semibold">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map((r) => (
              <tr key={r.condo.id} className="border-b border-divider last:border-0">
                <th scope="row" className="px-4 py-3 text-left font-normal">
                  {nome(r)}
                </th>
                {r.faltando.length > 0 ? (
                  <td colSpan={colunas.length} className="px-4 py-3">
                    <span className="flex items-center gap-3">
                      {implantacao(r)}
                      <span className="text-label text-text-muted">
                        Falta: {r.faltando.join(', ')}
                      </span>
                      <span className="ml-auto">{configurar(r)}</span>
                    </span>
                  </td>
                ) : (
                  colunas.map(([k]) => (
                    <td key={k} className="px-4 py-3">
                      {celulas(r)[k]}
                    </td>
                  ))
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
