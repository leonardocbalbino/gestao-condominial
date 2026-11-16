'use server';

import {
  parseBRL,
  type AttachmentDto,
  type ImportUnitsResult,
  type ReconciliationResultDto,
} from '@condo/contracts';
import { revalidatePath } from 'next/cache';
import { api, errorMessage } from '@/lib/api';
import { optional, text, UserError, type ActionState } from '@/lib/action-state';
import { staffContext } from '@/lib/context';

/** Executa a chamada, revalida a página e devolve a mensagem para o formulário. */
async function run(path: string, ok: string, call: () => Promise<unknown>): Promise<ActionState> {
  try {
    await call();
  } catch (error) {
    return { error: errorMessage(error) };
  }
  revalidatePath(path);
  return { ok };
}

async function call<T>(path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
  const { gestora } = await staffContext();
  return api<T>(path, { method, body, gestoraId: gestora.id });
}

const money = (form: FormData, name: string): number => {
  const value = parseBRL(text(form, name));
  if (value === null) throw new UserError(`Valor inválido em "${name}"`);
  return value;
};

const percentToBp = (form: FormData, name: string): number | undefined => {
  const raw = text(form, name).replace(',', '.');
  return raw === '' ? undefined : Math.round(Number(raw) * 100);
};

/** Envia o arquivo como comprovante (SHA-256 calculado na API) e devolve o id. */
async function uploadAttachment(condominioId: string, file: FormDataEntryValue | null) {
  if (!(file instanceof File) || file.size === 0) return null;
  const { gestora } = await staffContext();
  const form = new FormData();
  form.set('file', file, file.name);
  const att = await api<AttachmentDto>(`/condominios/${condominioId}/attachments`, {
    method: 'POST',
    form,
    gestoraId: gestora.id,
  });
  return att.id;
}

// --- Visão geral -------------------------------------------------------------

export async function updateConfigAction(id: string, _: ActionState, form: FormData) {
  return run(`/painel/c/${id}`, 'Configuração salva.', () =>
    call(`/condominios/${id}/config`, 'PATCH', {
      cobranca: {
        diaVencimento: Number(text(form, 'diaVencimento')),
        multaBp: percentToBp(form, 'multa'),
        jurosMensalBp: percentToBp(form, 'juros'),
        fundoReservaBp: percentToBp(form, 'fundo'),
      },
      pagamentos: { limiteSegundaAprovacaoCentavos: money(form, 'limite') },
    }),
  );
}

export async function activateAccountAction(id: string, _: ActionState, form: FormData) {
  return run(`/painel/c/${id}`, 'Conta no broker aberta.', () =>
    call(`/condominios/${id}/billing/account`, 'POST', {
      email: text(form, 'email'),
      telefone: text(form, 'telefone'),
      faturamentoMensalCentavos: money(form, 'faturamento'),
      endereco: {
        cep: text(form, 'cep'),
        logradouro: text(form, 'logradouro'),
        numero: text(form, 'numero'),
        complemento: optional(form, 'complemento'),
        bairro: text(form, 'bairro'),
        cidade: text(form, 'cidade'),
        uf: text(form, 'uf'),
      },
    }),
  );
}

export async function setupLedgerAction(id: string, _: ActionState, form: FormData) {
  return run(`/painel/c/${id}`, 'Contabilidade iniciada.', () =>
    call(`/condominios/${id}/ledger/setup`, 'POST', {
      mesInicial: text(form, 'mesInicial'),
      saldoInicialCentavos: money(form, 'saldo'),
    }),
  );
}

// --- Unidades ----------------------------------------------------------------

export async function generateBlockAction(id: string, _: ActionState, form: FormData) {
  return run(`/painel/c/${id}/unidades`, 'Bloco e unidades criados.', () =>
    call(`/condominios/${id}/blocks/generate`, 'POST', {
      nome: text(form, 'nome'),
      andares: Number(text(form, 'andares')),
      unidadesPorAndar: Number(text(form, 'porAndar')),
      andarInicial: Number(text(form, 'andarInicial') || '1'),
      fracaoIdeal: optional(form, 'fracao'),
    }),
  );
}

export async function importUnitsAction(id: string, _: ActionState, form: FormData) {
  const file = form.get('arquivo');
  const csv = file instanceof File && file.size > 0 ? await file.text() : text(form, 'csv');
  try {
    const result = await call<ImportUnitsResult>(`/condominios/${id}/units/import`, 'POST', {
      csv,
    });
    revalidatePath(`/painel/c/${id}/unidades`);
    return { ok: `${result.unidadesCriadas} unidades e ${result.blocosCriados} blocos criados.` };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function addOwnerAction(id: string, unitId: string, _: ActionState, form: FormData) {
  return run(
    `/painel/c/${id}/unidades/${unitId}`,
    'Proprietário cadastrado e convite enviado.',
    () =>
      call(`/condominios/${id}/units/${unitId}/grants/owner`, 'POST', {
        nome: text(form, 'nome'),
        email: text(form, 'email'),
        cpf: optional(form, 'cpf'),
        telefone: optional(form, 'telefone'),
      }),
  );
}

export async function addVehicleAction(id: string, unitId: string, _: ActionState, form: FormData) {
  return run(`/painel/c/${id}/unidades/${unitId}`, 'Veículo cadastrado.', () =>
    call(`/condominios/${id}/units/${unitId}/vehicles`, 'POST', {
      placa: text(form, 'placa'),
      modelo: optional(form, 'modelo'),
      cor: optional(form, 'cor'),
    }),
  );
}

// --- Cobrança ----------------------------------------------------------------

export async function createBudgetAction(id: string, _: ActionState, form: FormData) {
  const linhas = [...form.keys()]
    .filter((k) => k.startsWith('valor:'))
    .flatMap((k) => {
      const accountId = k.slice('valor:'.length);
      const value = text(form, k);
      if (!value) return [];
      const valorMensalCentavos = parseBRL(value);
      if (valorMensalCentavos === null) return [];
      return [{ accountId, valorMensalCentavos, criterio: text(form, `criterio:${accountId}`) }];
    });
  return run(`/painel/c/${id}/cobranca`, 'Orçamento salvo como rascunho.', () =>
    call(`/condominios/${id}/budgets`, 'POST', { ano: Number(text(form, 'ano')), linhas }),
  );
}

export async function approveBudgetAction(id: string, budgetId: string, _: ActionState) {
  return run(`/painel/c/${id}/cobranca`, 'Orçamento aprovado.', () =>
    call(`/condominios/${id}/budgets/${budgetId}/approve`, 'POST'),
  );
}

export async function emitRateioAction(id: string, _: ActionState, form: FormData) {
  return run(
    `/painel/c/${id}/cobranca`,
    'Cobranças emitidas. Os boletos chegam em instantes.',
    () =>
      call(`/condominios/${id}/rateio/emit`, 'POST', {
        competencia: text(form, 'competencia'),
        vencimento: optional(form, 'vencimento'),
      }),
  );
}

/** Só com o broker de testes: simula o pagamento e entrega o webhook para a própria API. */
export async function simulatePaymentAction(id: string, chargeId: string, _: ActionState) {
  return run(`/painel/c/${id}/cobranca`, 'Pagamento simulado e webhook entregue.', async () => {
    const delivery = await call<{ path: string; headers: Record<string, string>; body: unknown }>(
      `/condominios/${id}/charges/${chargeId}/simulate-payment`,
      'POST',
      {},
    );
    const res = await fetch(`${process.env.API_URL ?? 'http://localhost:3333'}${delivery.path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...delivery.headers },
      body: JSON.stringify(delivery.body),
    });
    if (!res.ok) throw new UserError(`Webhook recusado (${res.status})`);
  });
}

// --- Contas a pagar ----------------------------------------------------------

export async function createPayableAction(id: string, _: ActionState, form: FormData) {
  return run(
    `/painel/c/${id}/contas`,
    'Conta cadastrada. Aguardando aprovação do síndico.',
    async () => {
      const comprovanteId = await uploadAttachment(id, form.get('comprovante'));
      if (!comprovanteId) throw new UserError('Anexe a nota fiscal ou o boleto da conta.');
      await call(`/condominios/${id}/payables`, 'POST', {
        fornecedor: text(form, 'fornecedor'),
        fornecedorDocumento: optional(form, 'documento'),
        descricao: text(form, 'descricao'),
        accountId: text(form, 'accountId'),
        valorCentavos: money(form, 'valor'),
        vencimento: text(form, 'vencimento'),
        linhaDigitavel: optional(form, 'linhaDigitavel'),
        comprovanteId,
      });
    },
  );
}

export async function payableStepAction(
  id: string,
  payableId: string,
  step: 'approve' | 'approve-second' | 'pay',
  _: ActionState,
) {
  const messages = {
    approve: 'Aprovada.',
    'approve-second': 'Segunda assinatura registrada.',
    pay: 'Pagamento solicitado ao broker.',
  };
  return run(`/painel/c/${id}/contas`, messages[step], () =>
    call(`/condominios/${id}/payables/${payableId}/${step}`, 'POST'),
  );
}

export async function rejectPayableAction(
  id: string,
  payableId: string,
  etapa: 'reject' | 'reject-second',
  _: ActionState,
  form: FormData,
) {
  return run(`/painel/c/${id}/contas`, 'Conta recusada.', () =>
    call(`/condominios/${id}/payables/${payableId}/${etapa}`, 'POST', {
      motivo: text(form, 'motivo'),
    }),
  );
}

// --- Conciliação e fechamento ------------------------------------------------

export async function runReconciliationAction(id: string, _: ActionState) {
  try {
    const r = await call<ReconciliationResultDto>(`/condominios/${id}/reconciliation/run`, 'POST');
    revalidatePath(`/painel/c/${id}/conciliacao`);
    return {
      ok: `${r.importadas} linhas importadas: ${r.conciliadas} conciliadas, ${r.excecoes} exceções.`,
    };
  } catch (error) {
    return { error: errorMessage(error) };
  }
}

export async function resolveExceptionAction(
  id: string,
  lineId: string,
  _: ActionState,
  form: FormData,
) {
  return run(`/painel/c/${id}/conciliacao`, 'Exceção tratada.', () =>
    call(`/condominios/${id}/reconciliation/lines/${lineId}/resolve`, 'POST', {
      acao: optional(form, 'entryId') ? 'vincular' : 'justificar',
      entryId: optional(form, 'entryId'),
      nota: text(form, 'nota'),
    }),
  );
}

export async function closePeriodAction(id: string, periodId: string, _: ActionState) {
  return run(`/painel/c/${id}/fechamento`, 'Mês fechado. O hash dos lançamentos foi gravado.', () =>
    call(`/condominios/${id}/ledger/periods/${periodId}/close`, 'POST'),
  );
}

export async function manualEntryAction(id: string, _: ActionState, form: FormData) {
  return run(`/painel/c/${id}/fechamento`, 'Lançamento registrado.', async () => {
    const valor = money(form, 'valor');
    const comprovanteId = await uploadAttachment(id, form.get('comprovante'));
    const data = text(form, 'data');
    await call(`/condominios/${id}/ledger/entries`, 'POST', {
      dataCompetencia: data,
      dataCaixa: data,
      historico: text(form, 'historico'),
      ...(comprovanteId ? { comprovanteId } : {}),
      linhas: [
        { accountId: text(form, 'debito'), valorCentavos: valor },
        { accountId: text(form, 'credito'), valorCentavos: -valor },
      ],
    });
  });
}

export async function reverseEntryAction(
  id: string,
  entryId: string,
  _: ActionState,
  form: FormData,
) {
  return run(`/painel/c/${id}/fechamento`, 'Lançamento estornado.', () =>
    call(`/condominios/${id}/ledger/entries/${entryId}/reverse`, 'POST', {
      motivo: text(form, 'motivo'),
    }),
  );
}

// --- Comunicados -------------------------------------------------------------

export async function publishAnnouncementAction(id: string, _: ActionState, form: FormData) {
  return run(`/painel/c/${id}/comunicados`, 'Comunicado publicado.', () =>
    call(`/condominios/${id}/announcements`, 'POST', {
      titulo: text(form, 'titulo'),
      corpo: text(form, 'corpo'),
    }),
  );
}
