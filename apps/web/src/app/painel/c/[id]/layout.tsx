import type { CondominioDto } from '@condo/contracts';
import {
  Banknote,
  BookCheck,
  Building,
  FileText,
  LayoutDashboard,
  Megaphone,
  Scale,
} from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { api } from '@/lib/api';
import { staffContext } from '@/lib/context';

const tabs = [
  { href: '', label: 'Visão geral', icon: LayoutDashboard },
  { href: '/unidades', label: 'Unidades', icon: Building },
  { href: '/cobranca', label: 'Cobrança', icon: Banknote },
  { href: '/contas', label: 'Contas a pagar', icon: FileText },
  { href: '/conciliacao', label: 'Conciliação', icon: Scale },
  { href: '/fechamento', label: 'Fechamento', icon: BookCheck },
  { href: '/comunicados', label: 'Comunicados', icon: Megaphone },
];

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
      <p className="mb-1">
        <Link href="/painel" className="touch inline-flex items-center text-primary underline">
          ← Todos os condomínios
        </Link>
      </p>
      <h1 className="mb-4 text-3xl font-bold">{condo.nome}</h1>
      <nav aria-label="Seções do condomínio" className="mb-6 overflow-x-auto">
        <ul className="flex gap-2">
          {tabs.map(({ href, label, icon: Icon }) => (
            <li key={label}>
              <Link
                href={`/painel/c/${id}${href}`}
                className="touch flex items-center gap-2 whitespace-nowrap rounded-lg border-2 border-border bg-surface px-4 py-2 font-semibold hover:border-primary"
              >
                <Icon aria-hidden size={20} /> {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      {children}
    </>
  );
}
