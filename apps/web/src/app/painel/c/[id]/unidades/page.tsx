import type { UnitDto } from '@condo/contracts';
import { Building, FileUp } from 'lucide-react';
import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { Card, Field, ResponsiveTable } from '@/components/ui';
import { load } from '@/lib/load';
import { generateBlockAction, importUnitsAction } from '../actions';

export default async function UnidadesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const units = (await load<UnitDto[]>(`/condominios/${id}/units`)) ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
            <Building aria-hidden /> Gerar torre ou bloco
          </h2>
          <ActionForm action={generateBlockAction.bind(null, id)}>
            <Field label="Nome" name="nome" placeholder="Torre A" required />
            <div className="grid grid-cols-3 gap-3">
              <Field label="Andares" name="andares" type="number" min={1} required />
              <Field label="Por andar" name="porAndar" type="number" min={1} max={99} required />
              <Field label="1º andar" name="andarInicial" type="number" min={0} defaultValue={1} />
            </div>
            <Field
              label="Fração ideal de cada unidade"
              name="fracao"
              inputMode="decimal"
              hint="Opcional. Ex.: 0,025. Pode ser ajustada depois."
            />
            <SubmitButton>
              <Building aria-hidden /> Gerar unidades
            </SubmitButton>
          </ActionForm>
        </Card>

        <Card>
          <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
            <FileUp aria-hidden /> Importar planilha (CSV)
          </h2>
          <p className="mb-3 text-text-muted">
            Colunas: <code>bloco;andar;numero;tipo;fracao_ideal</code>. Se houver erro em alguma
            linha, nada é gravado.
          </p>
          <ActionForm action={importUnitsAction.bind(null, id)}>
            <Field label="Arquivo CSV" name="arquivo" type="file" accept=".csv,text/csv" />
            <SubmitButton>
              <FileUp aria-hidden /> Importar
            </SubmitButton>
          </ActionForm>
        </Card>
      </div>

      <h2 className="text-2xl font-bold">{units.length} unidades</h2>
      <ResponsiveTable
        rows={units}
        rowKey={(u) => u.id}
        empty="Gere um bloco ou importe a planilha de unidades."
        columns={[
          {
            label: 'Unidade',
            render: (u) => (
              <Link
                href={`/painel/c/${id}/unidades/${u.id}`}
                className="touch inline-flex items-center font-semibold text-primary underline"
              >
                {u.blockNome ? `${u.blockNome} · ${u.numero}` : u.numero}
              </Link>
            ),
          },
          { label: 'Tipo', render: (u) => u.tipo },
          { label: 'Andar', render: (u) => u.andar ?? '—' },
          {
            label: 'Fração ideal',
            align: 'right',
            render: (u) => u.fracaoIdeal?.replace('.', ',') ?? '—',
          },
        ]}
      />
    </div>
  );
}
