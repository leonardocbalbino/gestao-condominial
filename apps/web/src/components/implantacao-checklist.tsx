import type {
  ImplantacaoDto,
  ImplantacaoPasso,
  ImplantacaoPassoDto,
  StaffInviteDto,
} from '@condo/contracts';
import { CheckCircle2, Circle, Lock, Send, UserPlus } from 'lucide-react';
import {
  activateAccountAction,
  inviteStaffAction,
  resendInviteAction,
  setupLedgerAction,
} from '@/app/painel/c/[id]/actions';
import { todayMonth } from '@/lib/dates';
import { ActionForm, SubmitButton } from './action-form';
import { DialogClose, Drawer } from './dialog';
import { Badge, Button, ButtonLink, Card, Field, SelectField } from './ui';

const meta: Record<ImplantacaoPasso, { titulo: string; descricao: string; rotulo: string }> = {
  unidades: {
    titulo: 'Cadastrar torres e unidades',
    descricao: 'Gere “Torre A, 10 andares, 4 por andar” ou importe uma planilha CSV.',
    rotulo: 'unidades',
  },
  conta: {
    titulo: 'Abrir a conta de pagamentos',
    descricao:
      'Subconta do condomínio no broker: o dinheiro entra direto nela, nunca na plataforma.',
    rotulo: 'conta de pagamentos',
  },
  contabilidade: {
    titulo: 'Iniciar a contabilidade',
    descricao: 'Copia o plano de contas da gestora e abre o primeiro mês.',
    rotulo: 'contabilidade',
  },
  equipe: {
    titulo: 'Convidar síndico e conselho',
    descricao: 'Recebem um link por e-mail e configuram a verificação em duas etapas no 1º acesso.',
    rotulo: 'equipe',
  },
  cobranca: {
    titulo: 'Emitir a primeira cobrança',
    descricao: 'Aprove o orçamento do ano e gere o rateio do mês.',
    rotulo: 'primeira cobrança',
  },
};

function lista(nomes: string[]): string {
  return nomes.length <= 1 ? nomes.join('') : `${nomes.slice(0, -1).join(', ')} e ${nomes.at(-1)}`;
}

function ContaDrawer({ id, primary }: { id: string; primary: boolean }) {
  return (
    <Drawer
      trigger="Abrir conta"
      triggerStyle={{ variant: primary ? 'primary' : 'secondary', size: 'sm' }}
      title="Abrir a conta de pagamentos"
      description="Subconta do condomínio no broker. O dinheiro das cobranças entra direto nela."
    >
      <ActionForm
        action={activateAccountAction.bind(null, id)}
        className="grid gap-4 sm:grid-cols-2"
      >
        <Field
          label="E-mail financeiro"
          name="email"
          type="email"
          required
          wrapperClassName="sm:col-span-2"
        />
        <Field label="Telefone" name="telefone" inputMode="tel" required />
        <Field
          label="Arrecadação mensal estimada"
          name="faturamento"
          inputMode="decimal"
          required
        />
        <Field label="CEP" name="cep" inputMode="numeric" required />
        <Field label="Rua" name="logradouro" required />
        <Field label="Número" name="numero" required />
        <Field label="Complemento" name="complemento" />
        <Field label="Bairro" name="bairro" required />
        <Field label="Cidade" name="cidade" required />
        <Field label="UF" name="uf" maxLength={2} required />
        <div className="flex justify-end gap-2 sm:col-span-2">
          <DialogClose>Cancelar</DialogClose>
          <SubmitButton>Abrir conta</SubmitButton>
        </div>
      </ActionForm>
    </Drawer>
  );
}

function ContabilidadeDrawer({ id, primary }: { id: string; primary: boolean }) {
  return (
    <Drawer
      trigger="Iniciar"
      triggerStyle={{ variant: primary ? 'primary' : 'secondary', size: 'sm' }}
      title="Iniciar a contabilidade"
      description="Copia o plano de contas da gestora e abre o primeiro mês. O primeiro mês não muda depois."
    >
      <ActionForm action={setupLedgerAction.bind(null, id)} className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Primeiro mês"
          name="mesInicial"
          type="month"
          defaultValue={todayMonth()}
          required
        />
        <Field
          label="Saldo em conta no início"
          name="saldo"
          defaultValue="0,00"
          inputMode="decimal"
          hint="Saldo do banco no começo do primeiro mês."
          required
        />
        <div className="flex justify-end gap-2 sm:col-span-2">
          <DialogClose>Cancelar</DialogClose>
          <SubmitButton>Iniciar contabilidade</SubmitButton>
        </div>
      </ActionForm>
    </Drawer>
  );
}

function EquipeDrawer({
  id,
  invites,
  trigger,
  primary,
}: {
  id: string;
  /** Nulo quando a pessoa não pode ver a lista (sem `role:manage`). */
  invites: StaffInviteDto[] | null;
  trigger: string;
  primary: boolean;
}) {
  return (
    <Drawer
      trigger={trigger}
      triggerStyle={{
        variant: primary ? 'primary' : trigger === 'Editar' ? 'ghost' : 'secondary',
        size: 'sm',
      }}
      title="Convidar síndico e conselho"
      description="O convite chega por e-mail; no primeiro acesso a pessoa configura a verificação em duas etapas."
    >
      <ActionForm action={inviteStaffAction.bind(null, id)} className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" name="nome" required wrapperClassName="sm:col-span-2" />
        <Field label="E-mail" name="email" type="email" required />
        <SelectField label="Papel" name="papel" defaultValue="sindico">
          <option value="sindico">Síndico</option>
          <option value="conselheiro">Conselheiro</option>
        </SelectField>
        <div className="flex justify-end sm:col-span-2">
          <SubmitButton>
            <UserPlus aria-hidden size={18} /> Enviar convite
          </SubmitButton>
        </div>
      </ActionForm>

      {invites && (
        <section aria-labelledby="convites" className="mt-6 border-t border-divider pt-4">
          <h3 id="convites" className="mb-2 text-label font-semibold">
            Convites enviados
          </h3>
          {invites.length === 0 ? (
            <p className="text-text-muted">Nenhum convite ainda.</p>
          ) : (
            <ul className="flex flex-col">
              {invites.map((i) => (
                <li
                  key={i.assignmentId}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-divider py-3 last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{i.nome ?? i.email}</p>
                    <p className="truncate text-caption text-text-muted">
                      {i.papelNome} · {i.email}
                    </p>
                  </div>
                  <Badge tone={i.status === 'aceito' ? 'success' : 'warning'}>
                    {i.status === 'aceito' ? 'Aceito' : 'Pendente'}
                  </Badge>
                  {i.status === 'pendente' && (
                    <ActionForm
                      action={resendInviteAction.bind(null, id, i.assignmentId)}
                      className="flex items-center gap-2"
                    >
                      <SubmitButton variant="ghost" size="sm">
                        <Send aria-hidden size={16} /> Reenviar
                      </SubmitButton>
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </Drawer>
  );
}

function Acao({
  passo,
  id,
  invites,
  primary,
}: {
  passo: ImplantacaoPassoDto;
  id: string;
  invites: StaffInviteDto[] | null;
  primary: boolean;
}) {
  const base = `/painel/c/${id}`;
  const variant = primary ? 'primary' : 'secondary';
  switch (passo.chave) {
    case 'unidades':
      return passo.concluido ? (
        <ButtonLink href={`${base}/unidades`} variant="ghost" size="sm">
          Editar
        </ButtonLink>
      ) : (
        <ButtonLink href={`${base}/unidades`} variant={variant} size="sm">
          Cadastrar
        </ButtonLink>
      );
    case 'conta':
      return passo.concluido ? null : <ContaDrawer id={id} primary={primary} />;
    case 'contabilidade':
      return passo.concluido ? null : <ContabilidadeDrawer id={id} primary={primary} />;
    case 'equipe':
      return (
        <EquipeDrawer
          id={id}
          invites={invites}
          trigger={passo.concluido ? 'Editar' : 'Convidar'}
          primary={primary}
        />
      );
    case 'cobranca':
      if (passo.concluido) {
        return (
          <ButtonLink href={`${base}/cobranca`} variant="ghost" size="sm">
            Ver cobranças
          </ButtonLink>
        );
      }
      if (passo.bloqueadoPor.length > 0) {
        return (
          <Button variant="secondary" size="sm" disabled aria-describedby={`motivo-${passo.chave}`}>
            <Lock aria-hidden size={16} /> Emitir
          </Button>
        );
      }
      return (
        <ButtonLink href={`${base}/cobranca`} variant={variant} size="sm">
          Emitir
        </ButtonLink>
      );
  }
}

/**
 * Checklist da implantação: barra de progresso e um passo por linha (ícone de status,
 * título, uma frase e a ação). Só o primeiro passo pendente leva botão primário.
 */
export function ImplantacaoChecklist({
  id,
  status,
  invites,
}: {
  id: string;
  status: ImplantacaoDto;
  invites: StaffInviteDto[] | null;
}) {
  const pct = Math.round((status.concluidos / status.total) * 100);
  const proximo = status.passos.find((p) => !p.concluido && p.bloqueadoPor.length === 0);

  return (
    <Card
      title="Implantação do condomínio"
      actions={
        <span className="text-label text-text-muted">
          {status.concluidos} de {status.total} concluídos
        </span>
      }
    >
      <div aria-hidden className="mb-2 h-2 overflow-hidden rounded-full bg-divider">
        <div className="h-full rounded-full bg-success" style={{ width: `${pct}%` }} />
      </div>
      <ol>
        {status.passos.map((p, i) => {
          const m = meta[p.chave];
          return (
            <li
              key={p.chave}
              className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-divider py-4 last:border-0 last:pb-0"
            >
              {p.concluido ? (
                <CheckCircle2 aria-hidden size={24} className="shrink-0 text-success" />
              ) : (
                <Circle aria-hidden size={24} className="shrink-0 text-text-muted" />
              )}
              <div className="min-w-0 flex-1 basis-60">
                <p className="font-semibold">
                  <span className="sr-only">
                    Passo {i + 1}, {p.concluido ? 'concluído' : 'pendente'}:{' '}
                  </span>
                  {m.titulo}
                </p>
                <p className={`text-label ${p.concluido ? 'text-success' : 'text-text-muted'}`}>
                  {p.concluido ? p.resumo : m.descricao}
                </p>
                {!p.concluido && p.bloqueadoPor.length > 0 && (
                  <p id={`motivo-${p.chave}`} className="mt-1 text-caption text-text-muted">
                    Antes, conclua: {lista(p.bloqueadoPor.map((b) => meta[b].rotulo))}.
                  </p>
                )}
              </div>
              {/* No celular a ação desce para baixo do texto, alinhada a ele. */}
              <div className="pl-10 sm:pl-0">
                <Acao passo={p} id={id} invites={invites} primary={proximo?.chave === p.chave} />
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}
