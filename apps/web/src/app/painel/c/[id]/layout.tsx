import type { CondominioDto } from '@condo/contracts';
import type { ReactNode } from 'react';
import { api } from '@/lib/api';
import { staffContext } from '@/lib/context';

/** Título do condomínio; breadcrumb e seções ficam no topo e no menu lateral. */
export default async function CondominioLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { gestora } = await staffContext();
  const condo = await api<CondominioDto>(`/condominios/${id}`, { gestoraId: gestora.id });
  return (
    <>
      <h1 className="mb-6 text-page font-bold tracking-tight">{condo.nome}</h1>
      {children}
    </>
  );
}
