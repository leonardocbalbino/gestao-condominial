import {
  formatBRL,
  type CondominioConfig,
  type ImplantacaoDto,
  type StaffInviteDto,
} from '@condo/contracts';
import { Save } from 'lucide-react';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { ImplantacaoChecklist } from '@/components/implantacao-checklist';
import { Card, Field } from '@/components/ui';
import { load } from '@/lib/load';
import { updateConfigAction } from '../actions';

const pct = (bp: number) => (bp / 100).toLocaleString('pt-BR');

/** Configurações do condomínio: implantação (sempre acessível) e regras da convenção. */
export default async function ConfiguracoesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [status, invites, config] = await Promise.all([
    load<ImplantacaoDto>(`/condominios/${id}/implantacao`),
    load<StaffInviteDto[]>(`/condominios/${id}/staff-invites`),
    load<CondominioConfig>(`/condominios/${id}/config`),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-card font-semibold">Configurações do condomínio</h2>
      {status && <ImplantacaoChecklist id={id} status={status} invites={invites} />}
      {config && <RegrasConvencao id={id} config={config} />}
    </div>
  );
}

function RegrasConvencao({ id, config }: { id: string; config: CondominioConfig }) {
  return (
    <Card title="Regras da convenção">
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
          <SubmitButton variant="secondary">
            <Save aria-hidden size={18} /> Salvar regras
          </SubmitButton>
        </div>
      </ActionForm>
    </Card>
  );
}
