import type { MyChargeDto } from '@condo/contracts';
import Link from 'next/link';
import { ChargeCard } from '@/components/charge-card';
import { EmptyState } from '@/components/ui';
import { api } from '@/lib/api';
import { moradorContext, unitPath } from '@/lib/context';

/** Todas as taxas da unidade (o extrato da unidade), mais recentes primeiro. */
export default async function BoletosPage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string }>;
}) {
  const { unit } = await moradorContext((await searchParams).u);
  const charges = await api<MyChargeDto[]>(`${unitPath(unit)}/charges`, {
    gestoraId: unit.gestoraId,
  });
  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/morador?u=${unit.unitId}`}
        className="touch inline-flex items-center text-primary underline"
      >
        ← Início
      </Link>
      <h1 className="text-2xl font-bold">Boletos</h1>
      {charges.length === 0 ? (
        <EmptyState>Nenhuma taxa emitida ainda.</EmptyState>
      ) : (
        charges.map((c) => <ChargeCard key={c.id} charge={c} unitId={unit.unitId} />)
      )}
    </div>
  );
}
