import type { CondominioDto } from '@condo/contracts';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { api } from '@/lib/api';
import { staffContext } from '@/lib/context';

/** Cabeçalho do condomínio; as seções ficam no menu lateral (PainelNav). */
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
      <nav aria-label="Você está em" className="mb-1 text-text-muted">
        <Link
          href="/painel"
          className="touch inline-flex items-center font-semibold hover:text-primary"
        >
          Condomínios
        </Link>{' '}
        / <span aria-current="page">{condo.nome}</span>
      </nav>
      <h1 className="mb-6 text-3xl font-extrabold tracking-tight">{condo.nome}</h1>
      {children}
    </>
  );
}
