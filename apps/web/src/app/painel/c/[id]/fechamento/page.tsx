import {
  formatBRL,
  formatDate,
  type AccountDto,
  type BalanceteDto,
  type JournalEntryDto,
  type PeriodDto,
} from '@condo/contracts';
import { Lock, NotebookPen, ShieldCheck, Undo2 } from 'lucide-react';
import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { Badge, Card, EmptyState, Field, ResponsiveTable } from '@/components/ui';
import { todayIso } from '@/lib/dates';
import { load } from '@/lib/load';
import { closePeriodAction, manualEntryAction, reverseEntryAction } from '../actions';

const statusLabel: Record<PeriodDto['status'], string> = {
  aberto: 'Aberto',
  em_revisao: 'Fechado (em revisão)',
  aprovado: 'Aprovado',
  publicado: 'Publicado',
};

export default async function FechamentoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mes?: string }>;
}) {
  const { id } = await params;
  const { mes } = await searchParams;
  const base = `/condominios/${id}/ledger`;
  const [periods, accounts] = await Promise.all([
    load<PeriodDto[]>(`${base}/periods`),
    load<AccountDto[]>(`${base}/accounts`),
  ]);
  if (!periods || periods.length === 0) {
    return <EmptyState>Inicie a contabilidade na visão geral.</EmptyState>;
  }
  const period =
    periods.find((p) => p.mes === mes) ?? periods.find((p) => p.status === 'aberto') ?? periods[0];
  if (!period) return null;
  const [balancete, entries, verify] = await Promise.all([
    load<BalanceteDto>(`${base}/periods/${period.id}/balancete`),
    load<JournalEntryDto[]>(`${base}/periods/${period.id}/entries`),
    period.hash ? load<{ ok: boolean }>(`${base}/periods/${period.id}/verify`) : null,
  ]);
  const analytic = (accounts ?? []).filter((a) => a.analitica && a.ativa);

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Meses" className="flex flex-wrap gap-2">
        {periods.map((p) => (
          <Link
            key={p.id}
            href={`?mes=${p.mes}`}
            aria-current={p.id === period.id ? 'page' : undefined}
            className={`touch inline-flex items-center gap-2 rounded-lg border-2 px-4 font-semibold ${
              p.id === period.id
                ? 'border-primary bg-primary text-on-primary'
                : 'border-border bg-surface'
            }`}
          >
            {p.status !== 'aberto' && <Lock aria-hidden size={16} />} {p.mes}
          </Link>
        ))}
      </nav>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold">Mês {period.mes}</h2>
            <Badge tone={period.status === 'aberto' ? 'warning' : 'success'}>
              {statusLabel[period.status]}
            </Badge>
            {period.hash && (
              <p className="mt-2 flex items-center gap-2 break-all text-sm">
                <ShieldCheck aria-hidden className={verify?.ok ? 'text-success' : 'text-danger'} />
                {verify?.ok ? 'Íntegro' : 'Hash não confere!'} · SHA-256 {period.hash}
              </p>
            )}
          </div>
          {period.status === 'aberto' && (
            <ActionForm action={closePeriodAction.bind(null, id, period.id)}>
              <SubmitButton>
                <Lock aria-hidden /> Fechar o mês
              </SubmitButton>
            </ActionForm>
          )}
        </div>
        {balancete && (
          <dl className="mt-4 grid gap-4 sm:grid-cols-4">
            {[
              ['Receitas', balancete.totais.receitasCentavos],
              ['Despesas', balancete.totais.despesasCentavos],
              ['Resultado', balancete.totais.resultadoCentavos],
              ['Saldo em conta', balancete.totais.caixaFinalCentavos],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-border p-3">
                <dt className="text-text-muted">{label}</dt>
                <dd className="text-xl font-bold tabular-nums">{formatBRL(Number(value))}</dd>
              </div>
            ))}
          </dl>
        )}
      </Card>

      {balancete && (
        <section>
          <h2 className="mb-3 text-2xl font-bold">Balancete</h2>
          <ResponsiveTable
            rows={balancete.linhas}
            rowKey={(l) => l.accountId}
            columns={[
              { label: 'Conta', render: (l) => `${l.codigo} ${l.nome}` },
              {
                label: 'Saldo anterior',
                align: 'right',
                render: (l) => formatBRL(l.saldoAnteriorCentavos),
              },
              { label: 'Débitos', align: 'right', render: (l) => formatBRL(l.debitosCentavos) },
              { label: 'Créditos', align: 'right', render: (l) => formatBRL(l.creditosCentavos) },
              {
                label: 'Saldo final',
                align: 'right',
                render: (l) => formatBRL(l.saldoFinalCentavos),
              },
            ]}
          />
        </section>
      )}

      <section>
        <h2 className="mb-3 text-2xl font-bold">Lançamentos</h2>
        {!entries || entries.length === 0 ? (
          <EmptyState>Nenhum lançamento neste mês.</EmptyState>
        ) : (
          <ul className="flex flex-col gap-3">
            {entries.map((e) => (
              <li key={e.id} className="rounded-xl border border-border bg-surface p-4">
                <div className="flex flex-wrap justify-between gap-2">
                  <p className="font-semibold">
                    {formatDate(e.dataCaixa)} · {e.historico}
                  </p>
                  {e.estornadoPor && <Badge tone="danger">Estornado</Badge>}
                  {e.comprovanteId && <Badge tone="success">Com comprovante</Badge>}
                </div>
                <ul className="mt-2 text-sm">
                  {e.linhas.map((l) => (
                    <li key={l.accountId} className="flex justify-between gap-4 tabular-nums">
                      <span>
                        {l.codigo} {l.conta}
                      </span>
                      <span>
                        {l.valorCentavos > 0
                          ? `D ${formatBRL(l.valorCentavos)}`
                          : `C ${formatBRL(-l.valorCentavos)}`}
                      </span>
                    </li>
                  ))}
                </ul>
                {period.status === 'aberto' && !e.estornadoPor && e.origem !== 'estorno' && (
                  <ActionForm
                    action={reverseEntryAction.bind(null, id, e.id)}
                    className="mt-3 flex flex-wrap items-end gap-2"
                  >
                    <Field label="Motivo do estorno" name="motivo" required minLength={5} />
                    <SubmitButton variant="secondary">
                      <Undo2 aria-hidden /> Estornar
                    </SubmitButton>
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Card>
        <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
          <NotebookPen aria-hidden /> Lançamento manual
        </h2>
        <ActionForm action={manualEntryAction.bind(null, id)} className="grid gap-4 sm:grid-cols-2">
          <Field label="Data" name="data" type="date" defaultValue={todayIso()} required />
          <Field label="Valor" name="valor" inputMode="decimal" required />
          <div className="sm:col-span-2">
            <Field label="Histórico" name="historico" required minLength={3} />
          </div>
          {(['debito', 'credito'] as const).map((side) => (
            <label key={side} className="flex flex-col gap-1">
              <span className="font-semibold">
                {side === 'debito' ? 'Conta a debitar' : 'Conta a creditar'}
              </span>
              <select
                name={side}
                required
                className="min-h-12 rounded-lg border-2 border-border bg-surface px-3"
              >
                {analytic.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.codigo} {a.nome}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <div className="sm:col-span-2">
            <Field
              label="Comprovante"
              name="comprovante"
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              hint="Obrigatório em saídas de dinheiro."
            />
          </div>
          <SubmitButton>
            <NotebookPen aria-hidden /> Lançar
          </SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
