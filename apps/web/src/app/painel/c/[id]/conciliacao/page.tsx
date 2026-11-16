import { formatBRL, formatDate, type StatementLineDto } from '@condo/contracts';
import { RefreshCw, TriangleAlert } from 'lucide-react';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { Badge, Card, EmptyState, Field, ResponsiveTable } from '@/components/ui';
import { load } from '@/lib/load';
import { resolveExceptionAction, runReconciliationAction } from '../actions';

export default async function ConciliacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lines = (await load<StatementLineDto[]>(`/condominios/${id}/reconciliation/lines`)) ?? [];
  const exceptions = lines.filter((l) => l.status === 'excecao');

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <h2 className="mb-2 text-xl font-bold">Extrato da conta do condomínio</h2>
        <p className="mb-4 text-text-muted">
          A conciliação roda sozinha todo dia às 6h. Você também pode rodar agora.
        </p>
        <ActionForm action={runReconciliationAction.bind(null, id)}>
          <SubmitButton>
            <RefreshCw aria-hidden /> Conciliar agora
          </SubmitButton>
        </ActionForm>
      </Card>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-2xl font-bold">
          <TriangleAlert aria-hidden /> Exceções ({exceptions.length})
        </h2>
        {exceptions.length === 0 ? (
          <EmptyState>Nenhuma divergência. O mês pode ser fechado.</EmptyState>
        ) : (
          <div className="flex flex-col gap-4">
            {exceptions.map((l) => (
              <Card key={l.id} tone="warning">
                <p className="text-lg font-bold">
                  {formatDate(l.data)} · {formatBRL(l.valorCentavos)}
                </p>
                <p>{l.descricao}</p>
                <p className="mb-3 text-warning">{l.motivo}</p>
                <ActionForm
                  action={resolveExceptionAction.bind(null, id, l.id)}
                  className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
                >
                  <Field
                    label="Lançamento correspondente (opcional)"
                    name="entryId"
                    placeholder="id do lançamento"
                  />
                  <Field label="Justificativa" name="nota" required minLength={5} />
                  <SubmitButton>Tratar</SubmitButton>
                </ActionForm>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-2xl font-bold">Linhas importadas</h2>
        <ResponsiveTable
          rows={lines}
          rowKey={(l) => l.id}
          empty="Nada importado ainda."
          columns={[
            { label: 'Data', render: (l) => formatDate(l.data) },
            { label: 'Descrição', render: (l) => l.descricao },
            { label: 'Valor', align: 'right', render: (l) => formatBRL(l.valorCentavos) },
            {
              label: 'Situação',
              render: (l) => (
                <Badge
                  tone={
                    l.status === 'conciliada'
                      ? 'success'
                      : l.status === 'resolvida'
                        ? 'neutral'
                        : 'warning'
                  }
                >
                  {l.status === 'conciliada'
                    ? 'Conciliada'
                    : l.status === 'resolvida'
                      ? 'Tratada'
                      : 'Exceção'}
                </Badge>
              ),
            },
          ]}
        />
      </section>
    </div>
  );
}
