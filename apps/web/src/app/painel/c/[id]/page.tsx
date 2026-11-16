import {
  formatBRL,
  type CondominioConfig,
  type PaymentAccountDto,
  type PeriodDto,
} from '@condo/contracts';
import { BookOpen, Landmark, Save, Settings } from 'lucide-react';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { Card, Field } from '@/components/ui';
import { todayMonth } from '@/lib/dates';
import { load } from '@/lib/load';
import { activateAccountAction, setupLedgerAction, updateConfigAction } from './actions';

const pct = (bp: number) => (bp / 100).toLocaleString('pt-BR');

export default async function VisaoGeralPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [config, account, periods] = await Promise.all([
    load<CondominioConfig>(`/condominios/${id}/config`),
    load<PaymentAccountDto>(`/condominios/${id}/billing/account`),
    load<PeriodDto[]>(`/condominios/${id}/ledger/periods`),
  ]);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
          <BookOpen aria-hidden /> Contabilidade
        </h2>
        {periods && periods.length > 0 ? (
          <p>
            Iniciada. Mês aberto mais antigo:{' '}
            <strong>{periods.filter((p) => p.status === 'aberto').at(-1)?.mes ?? '—'}</strong>.
          </p>
        ) : (
          <ActionForm action={setupLedgerAction.bind(null, id)}>
            <p className="text-text-muted">
              Copia o plano de contas da gestora e abre o primeiro mês.
            </p>
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
              required
            />
            <SubmitButton>
              <BookOpen aria-hidden /> Iniciar contabilidade
            </SubmitButton>
          </ActionForm>
        )}
      </Card>

      <Card>
        <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
          <Landmark aria-hidden /> Conta de pagamentos (broker)
        </h2>
        {account ? (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2">
            <dt className="text-text-muted">Broker</dt>
            <dd>{account.provider === 'fake' ? 'Simulado (homologação)' : 'Asaas'}</dd>
            <dt className="text-text-muted">Conta</dt>
            <dd className="break-all">{account.providerAccountId}</dd>
          </dl>
        ) : (
          <ActionForm action={activateAccountAction.bind(null, id)}>
            <p className="text-text-muted">
              Abre a subconta do condomínio: o dinheiro entra direto nela, nunca na plataforma.
            </p>
            <Field label="E-mail financeiro" name="email" type="email" required />
            <Field label="Telefone" name="telefone" inputMode="tel" required />
            <Field
              label="Arrecadação mensal estimada"
              name="faturamento"
              inputMode="decimal"
              required
            />
            <Field label="CEP" name="cep" inputMode="numeric" required />
            <Field label="Rua" name="logradouro" required />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Número" name="numero" required />
              <Field label="Complemento" name="complemento" />
            </div>
            <Field label="Bairro" name="bairro" required />
            <div className="grid grid-cols-[1fr_6rem] gap-3">
              <Field label="Cidade" name="cidade" required />
              <Field label="UF" name="uf" maxLength={2} required />
            </div>
            <SubmitButton>
              <Landmark aria-hidden /> Abrir conta
            </SubmitButton>
          </ActionForm>
        )}
      </Card>

      {config && (
        <Card className="lg:col-span-2">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
            <Settings aria-hidden /> Regras da convenção
          </h2>
          <ActionForm
            action={updateConfigAction.bind(null, id)}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            <Field
              label="Dia do vencimento"
              name="diaVencimento"
              type="number"
              min={1}
              max={28}
              defaultValue={config.cobranca.diaVencimento}
            />
            <Field
              label="Multa por atraso (%)"
              name="multa"
              inputMode="decimal"
              defaultValue={pct(config.cobranca.multaBp)}
              hint="Máximo de 2% (Código Civil, art. 1.336, §1º)."
            />
            <Field
              label="Juros ao mês (%)"
              name="juros"
              inputMode="decimal"
              defaultValue={pct(config.cobranca.jurosMensalBp)}
              hint="1% ao mês, salvo outra taxa na convenção."
            />
            <Field
              label="Fundo de reserva (% sobre a taxa)"
              name="fundo"
              inputMode="decimal"
              defaultValue={pct(config.cobranca.fundoReservaBp)}
            />
            <Field
              label="Segunda assinatura acima de"
              name="limite"
              inputMode="decimal"
              defaultValue={formatBRL(config.pagamentos.limiteSegundaAprovacaoCentavos)}
            />
            <div className="flex items-end">
              <SubmitButton>
                <Save aria-hidden /> Salvar regras
              </SubmitButton>
            </div>
          </ActionForm>
        </Card>
      )}
    </div>
  );
}
