import { formatBRL, formatDate, type AccountDto, type PayableDto } from '@condo/contracts';
import { BadgeCheck, Banknote, FilePlus, PenLine, X } from 'lucide-react';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { Badge, Card, EmptyState, Field } from '@/components/ui';
import { todayIso } from '@/lib/dates';
import { load } from '@/lib/load';
import { createPayableAction, payableStepAction, rejectPayableAction } from '../actions';

const statusText: Record<
  PayableDto['status'],
  [string, 'neutral' | 'success' | 'warning' | 'danger']
> = {
  aguardando_aprovacao: ['Aguardando síndico', 'warning'],
  aguardando_segunda_aprovacao: ['Aguardando conselho', 'warning'],
  aprovada: ['Aprovada', 'success'],
  pagamento_solicitado: ['Pagando…', 'neutral'],
  paga: ['Paga', 'success'],
  rejeitada: ['Recusada', 'danger'],
};

export default async function ContasPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [payables, accounts] = await Promise.all([
    load<PayableDto[]>(`/condominios/${id}/payables`),
    load<AccountDto[]>(`/condominios/${id}/ledger/accounts`),
  ]);
  const expenses = (accounts ?? []).filter((a) => a.natureza === 'despesa' && a.analitica);
  const accountName = new Map((accounts ?? []).map((a) => [a.id, `${a.codigo} ${a.nome}`]));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-bold">Contas a pagar</h2>
        {!payables || payables.length === 0 ? (
          <EmptyState>Nenhuma conta cadastrada.</EmptyState>
        ) : (
          payables.map((p) => {
            const [label, tone] = statusText[p.status];
            return (
              <Card key={p.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-bold">{p.fornecedor}</p>
                    <p className="text-text-muted">{p.descricao}</p>
                    <p className="text-text-muted">{accountName.get(p.accountId)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold tabular-nums">{formatBRL(p.valorCentavos)}</p>
                    <p>vence {formatDate(p.vencimento)}</p>
                    <Badge tone={tone}>{label}</Badge>
                  </div>
                </div>
                {p.requerSegundaAprovacao && (
                  <p className="mt-2 text-sm text-text-muted">
                    Acima do limite: exige segunda assinatura.
                  </p>
                )}
                {p.motivoRejeicao && <p className="mt-2 text-danger">Motivo: {p.motivoRejeicao}</p>}
                <div className="mt-4 flex flex-wrap gap-3">
                  {p.status === 'aguardando_aprovacao' && (
                    <ActionForm action={payableStepAction.bind(null, id, p.id, 'approve')}>
                      <SubmitButton>
                        <BadgeCheck aria-hidden /> Aprovar (síndico)
                      </SubmitButton>
                    </ActionForm>
                  )}
                  {p.status === 'aguardando_segunda_aprovacao' && (
                    <ActionForm action={payableStepAction.bind(null, id, p.id, 'approve-second')}>
                      <SubmitButton>
                        <PenLine aria-hidden /> Segunda assinatura (conselho)
                      </SubmitButton>
                    </ActionForm>
                  )}
                  {p.status === 'aprovada' && (
                    <ActionForm action={payableStepAction.bind(null, id, p.id, 'pay')}>
                      <SubmitButton>
                        <Banknote aria-hidden /> Pagar pelo broker
                      </SubmitButton>
                    </ActionForm>
                  )}
                  {(p.status === 'aguardando_aprovacao' ||
                    p.status === 'aguardando_segunda_aprovacao') && (
                    <ActionForm
                      action={rejectPayableAction.bind(
                        null,
                        id,
                        p.id,
                        p.status === 'aguardando_aprovacao' ? 'reject' : 'reject-second',
                      )}
                      className="flex flex-wrap items-end gap-2"
                    >
                      <Field label="Motivo da recusa" name="motivo" required minLength={5} />
                      <SubmitButton variant="danger">
                        <X aria-hidden /> Recusar
                      </SubmitButton>
                    </ActionForm>
                  )}
                </div>
              </Card>
            );
          })
        )}
      </section>

      <Card className="h-fit">
        <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
          <FilePlus aria-hidden /> Nova conta
        </h2>
        <ActionForm action={createPayableAction.bind(null, id)}>
          <Field label="Fornecedor" name="fornecedor" required />
          <Field label="CPF ou CNPJ do fornecedor" name="documento" inputMode="numeric" />
          <Field label="Descrição" name="descricao" required />
          <label className="flex flex-col gap-1">
            <span className="font-semibold">Conta de despesa</span>
            <select
              name="accountId"
              required
              className="min-h-12 rounded-lg border-2 border-border bg-surface px-3"
            >
              {expenses.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.codigo} {a.nome}
                </option>
              ))}
            </select>
          </label>
          <Field label="Valor" name="valor" inputMode="decimal" required />
          <Field
            label="Vencimento"
            name="vencimento"
            type="date"
            defaultValue={todayIso()}
            required
          />
          <Field label="Linha digitável do boleto" name="linhaDigitavel" inputMode="numeric" />
          <Field
            label="Nota fiscal ou boleto (obrigatório)"
            name="comprovante"
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp"
            required
            hint="Sem comprovante, sem despesa."
          />
          <SubmitButton>
            <FilePlus aria-hidden /> Cadastrar conta
          </SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
