import type { PersonDto, UnitDto, UnitGrantDto, VehicleDto } from '@condo/contracts';
import { Car, UserPlus } from 'lucide-react';
import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { Badge, Card, EmptyState, Field } from '@/components/ui';
import { load } from '@/lib/load';
import { addOwnerAction, addVehicleAction } from '../../actions';

type Grant = UnitGrantDto & { pessoa: PersonDto };

export default async function UnidadePage({
  params,
}: {
  params: Promise<{ id: string; unitId: string }>;
}) {
  const { id, unitId } = await params;
  const base = `/condominios/${id}/units/${unitId}`;
  const [unit, grants, vehicles] = await Promise.all([
    load<UnitDto>(base),
    load<Grant[]>(`${base}/grants`),
    load<VehicleDto[]>(`${base}/vehicles`),
  ]);
  if (!unit) return <EmptyState>Unidade não encontrada.</EmptyState>;

  return (
    <div className="flex flex-col gap-6">
      <p>
        <Link
          href={`/painel/c/${id}/unidades`}
          className="touch inline-flex items-center text-primary underline"
        >
          ← Unidades
        </Link>
      </p>
      <h2 className="text-2xl font-bold">
        {unit.blockNome ? `${unit.blockNome} · ${unit.numero}` : unit.numero}
      </h2>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h3 className="mb-4 text-xl font-bold">Quem tem acesso</h3>
          {grants && grants.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {grants.map((g) => (
                <li key={g.id} className="rounded-lg border border-border p-3">
                  <p className="font-semibold">{g.pessoa.nome}</p>
                  <p className="text-text-muted">
                    {g.pessoa.email} · CPF {g.pessoa.cpfMascarado ?? 'não informado'}
                  </p>
                  <Badge tone="success">{g.perfil}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>Ninguém vinculado ainda.</EmptyState>
          )}
          <h3 className="mb-3 mt-6 flex items-center gap-2 text-lg font-bold">
            <UserPlus aria-hidden /> Cadastrar proprietário
          </h3>
          <ActionForm action={addOwnerAction.bind(null, id, unitId)}>
            <Field label="Nome completo" name="nome" required />
            <Field label="E-mail (recebe o convite)" name="email" type="email" required />
            <Field
              label="CPF"
              name="cpf"
              inputMode="numeric"
              hint="Necessário para emitir o boleto."
            />
            <Field label="Telefone" name="telefone" inputMode="tel" />
            <SubmitButton>
              <UserPlus aria-hidden /> Cadastrar e convidar
            </SubmitButton>
          </ActionForm>
        </Card>

        <Card>
          <h3 className="mb-4 flex items-center gap-2 text-xl font-bold">
            <Car aria-hidden /> Veículos
          </h3>
          {vehicles && vehicles.length > 0 ? (
            <ul className="mb-4 flex flex-col gap-2">
              {vehicles.map((v) => (
                <li key={v.id} className="rounded-lg border border-border p-3">
                  <strong>{v.placa}</strong> {v.modelo} {v.cor}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>Nenhum veículo.</EmptyState>
          )}
          <ActionForm action={addVehicleAction.bind(null, id, unitId)}>
            <Field label="Placa" name="placa" required />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Modelo" name="modelo" />
              <Field label="Cor" name="cor" />
            </div>
            <SubmitButton>
              <Car aria-hidden /> Cadastrar veículo
            </SubmitButton>
          </ActionForm>
        </Card>
      </div>
    </div>
  );
}
