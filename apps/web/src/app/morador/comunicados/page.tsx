import type { AnnouncementDto } from '@condo/contracts';
import { CheckCheck } from 'lucide-react';
import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { Badge, Card, EmptyState } from '@/components/ui';
import { api } from '@/lib/api';
import { moradorContext, unitPath } from '@/lib/context';
import { markReadAction } from '../actions';

export default async function AvisosPage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string }>;
}) {
  const { unit } = await moradorContext((await searchParams).u);
  const list = await api<AnnouncementDto[]>(`${unitPath(unit)}/announcements`, {
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
      <h1 className="text-2xl font-bold">Avisos do condomínio</h1>
      {list.length === 0 ? (
        <EmptyState>Nenhum aviso por enquanto.</EmptyState>
      ) : (
        list.map((a) => (
          <Card key={a.id} tone={a.lido ? undefined : 'warning'}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <h2 className="text-xl font-bold">{a.titulo}</h2>
              {a.lido && <Badge tone="success">Lido</Badge>}
            </div>
            <p className="mt-2 whitespace-pre-line">{a.corpo}</p>
            {!a.lido && (
              <ActionForm action={markReadAction.bind(null, unit.unitId, a.id)} className="mt-4">
                <SubmitButton>
                  <CheckCheck aria-hidden /> Li e entendi
                </SubmitButton>
              </ActionForm>
            )}
          </Card>
        ))
      )}
    </div>
  );
}
