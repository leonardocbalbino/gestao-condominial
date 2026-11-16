import {
  formatBRL,
  formatDate,
  type AccountDto,
  type BudgetDto,
  type ChargeDto,
  type InadimplenciaDto,
  type PaymentAccountDto,
  type RateioPreviewDto,
} from '@condo/contracts';
import { Calculator, CheckCircle2, Eye, Send, Wallet } from 'lucide-react';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { Badge, Card, EmptyState, Field, ResponsiveTable } from '@/components/ui';
import { todayMonth } from '@/lib/dates';
import { load } from '@/lib/load';
import {
  approveBudgetAction,
  createBudgetAction,
  emitRateioAction,
  simulatePaymentAction,
} from '../actions';

const statusLabel: Record<
  ChargeDto['status'],
  [string, 'neutral' | 'success' | 'warning' | 'danger']
> = {
  pendente_emissao: ['Emitindo…', 'neutral'],
  emitida: ['Em aberto', 'warning'],
  erro_emissao: ['Erro na emissão', 'danger'],
  paga: ['Paga', 'success'],
  cancelada: ['Cancelada', 'neutral'],
};

export default async function CobrancaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ competencia?: string; vencimento?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const competencia = query.competencia ?? todayMonth();
  const base = `/condominios/${id}`;
  const previewQuery = new URLSearchParams({
    competencia,
    ...(query.vencimento ? { vencimento: query.vencimento } : {}),
  });

  const [budgets, accounts, charges, inadimplencia, account, preview] = await Promise.all([
    load<BudgetDto[]>(`${base}/budgets`),
    load<AccountDto[]>(`${base}/ledger/accounts`),
    load<ChargeDto[]>(`${base}/charges?competencia=${competencia}`),
    load<InadimplenciaDto[]>(`${base}/charges/inadimplencia`),
    load<PaymentAccountDto>(`${base}/billing/account`),
    query.competencia ? load<RateioPreviewDto>(`${base}/rateio/preview?${previewQuery}`) : null,
  ]);
  const expenseAccounts = (accounts ?? []).filter(
    (a) => a.natureza === 'despesa' && a.grupo === 'ordinaria' && a.analitica,
  );
  const ano = Number(competencia.slice(0, 4));
  const budgetOfYear = budgets?.find((b) => b.ano === ano);

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
          <Wallet aria-hidden /> Orçamento de {ano}
        </h2>
        {budgetOfYear ? (
          <>
            <p className="mb-3">
              <Badge tone={budgetOfYear.status === 'aprovado' ? 'success' : 'warning'}>
                {budgetOfYear.status === 'aprovado' ? 'Aprovado' : 'Rascunho'}
              </Badge>{' '}
              Previsão mensal: <strong>{formatBRL(budgetOfYear.totalMensalCentavos)}</strong>
            </p>
            <ResponsiveTable
              rows={budgetOfYear.linhas}
              rowKey={(l) => l.accountId}
              columns={[
                { label: 'Conta', render: (l) => `${l.codigo} ${l.conta}` },
                {
                  label: 'Rateio',
                  render: (l) =>
                    l.criterio === 'fracao_ideal' ? 'Fração ideal' : 'Igual entre unidades',
                },
                {
                  label: 'Por mês',
                  align: 'right',
                  render: (l) => formatBRL(l.valorMensalCentavos),
                },
              ]}
            />
            {budgetOfYear.status === 'rascunho' && (
              <ActionForm
                action={approveBudgetAction.bind(null, id, budgetOfYear.id)}
                className="mt-4"
              >
                <SubmitButton>
                  <CheckCircle2 aria-hidden /> Aprovar orçamento
                </SubmitButton>
              </ActionForm>
            )}
          </>
        ) : expenseAccounts.length === 0 ? (
          <EmptyState>Inicie a contabilidade na visão geral para montar o orçamento.</EmptyState>
        ) : (
          <ActionForm action={createBudgetAction.bind(null, id)}>
            <input type="hidden" name="ano" value={ano} />
            <p className="text-text-muted">
              Preencha a previsão mensal das despesas. Contas em branco ficam fora.
            </p>
            <ul className="flex flex-col gap-3">
              {expenseAccounts.map((a) => (
                <li key={a.id} className="grid items-end gap-3 sm:grid-cols-[1fr_10rem_14rem]">
                  <span className="font-medium">
                    {a.codigo} {a.nome}
                  </span>
                  <Field
                    label="Por mês"
                    name={`valor:${a.id}`}
                    inputMode="decimal"
                    placeholder="0,00"
                  />
                  <label className="flex flex-col gap-1">
                    <span className="font-semibold">Rateio</span>
                    <select
                      name={`criterio:${a.id}`}
                      className="min-h-12 rounded-lg border-2 border-border bg-surface px-3"
                    >
                      <option value="fracao_ideal">Fração ideal</option>
                      <option value="igualitario">Igual entre unidades</option>
                    </select>
                  </label>
                </li>
              ))}
            </ul>
            <SubmitButton>
              <Wallet aria-hidden /> Salvar orçamento
            </SubmitButton>
          </ActionForm>
        )}
      </Card>

      <Card>
        <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
          <Calculator aria-hidden /> Rateio do mês
        </h2>
        <form className="mb-4 flex flex-wrap items-end gap-3">
          <Field
            label="Competência"
            name="competencia"
            type="month"
            defaultValue={competencia}
            required
          />
          <Field label="Vencimento" name="vencimento" type="date" defaultValue={query.vencimento} />
          <button className="inline-flex min-h-12 items-center gap-2 rounded-lg border-2 border-border bg-surface px-5 font-semibold">
            <Eye aria-hidden /> Ver prévia
          </button>
        </form>
        {preview && (
          <>
            <p className="mb-3">
              Total: <strong>{formatBRL(preview.totalCentavos)}</strong> · vencimento{' '}
              {formatDate(preview.vencimento)}
            </p>
            {preview.pendencias.length > 0 && (
              <ul className="mb-3 list-disc rounded-lg border-2 border-warning p-3 pl-8 text-warning">
                {preview.pendencias.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            <ResponsiveTable
              rows={preview.unidades}
              rowKey={(u) => u.unitId}
              columns={[
                { label: 'Unidade', render: (u) => u.unidade },
                { label: 'Pagador', render: (u) => u.pagador ?? '—' },
                { label: 'Taxa', align: 'right', render: (u) => formatBRL(u.taxaCentavos) },
                {
                  label: 'Fundo de reserva',
                  align: 'right',
                  render: (u) => formatBRL(u.fundoReservaCentavos),
                },
                {
                  label: 'Total',
                  align: 'right',
                  render: (u) => <strong>{formatBRL(u.totalCentavos)}</strong>,
                },
              ]}
            />
            {preview.pendencias.length === 0 && (
              <ActionForm action={emitRateioAction.bind(null, id)} className="mt-4">
                <input type="hidden" name="competencia" value={preview.competencia} />
                <input type="hidden" name="vencimento" value={preview.vencimento} />
                <SubmitButton>
                  <Send aria-hidden /> Emitir {preview.unidades.length} boletos
                </SubmitButton>
              </ActionForm>
            )}
          </>
        )}
      </Card>

      <section>
        <h2 className="mb-3 text-2xl font-bold">Cobranças de {competencia}</h2>
        <ResponsiveTable
          rows={charges ?? []}
          rowKey={(c) => c.id}
          empty="Nenhuma cobrança nesta competência."
          columns={[
            { label: 'Unidade', render: (c) => c.unidade },
            { label: 'Vencimento', render: (c) => formatDate(c.vencimento) },
            { label: 'Valor', align: 'right', render: (c) => formatBRL(c.valorCentavos) },
            {
              label: 'Situação',
              render: (c) => {
                const [label, tone] = statusLabel[c.status];
                return <Badge tone={tone}>{label}</Badge>;
              },
            },
            {
              label: 'Ação',
              render: (c) =>
                account?.provider === 'fake' && c.status === 'emitida' ? (
                  <ActionForm action={simulatePaymentAction.bind(null, id, c.id)}>
                    <SubmitButton variant="secondary">Simular pagamento</SubmitButton>
                  </ActionForm>
                ) : (
                  (c.erroEmissao ?? '—')
                ),
            },
          ]}
        />
      </section>

      {inadimplencia && (
        <section>
          <h2 className="mb-3 text-2xl font-bold">Inadimplência</h2>
          <ResponsiveTable
            rows={inadimplencia}
            rowKey={(i) => i.chargeId}
            empty="Nenhuma taxa em atraso."
            columns={[
              { label: 'Unidade', render: (i) => i.unidade },
              { label: 'Responsável', render: (i) => i.pagador ?? '—' },
              { label: 'Competência', render: (i) => i.competencia },
              { label: 'Dias em atraso', align: 'right', render: (i) => i.diasAtraso },
              {
                label: 'Valor atualizado',
                align: 'right',
                render: (i) => formatBRL(i.valorAtualizadoCentavos),
              },
            ]}
          />
        </section>
      )}
    </div>
  );
}
