'use client';

import {
  Banknote,
  BookCheck,
  Building,
  Building2,
  FileText,
  LayoutDashboard,
  Megaphone,
  Scale,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/** Seções de um condomínio; aparecem no menu quando se está dentro dele. */
const condoSections: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '', label: 'Visão geral', icon: LayoutDashboard },
  { href: '/unidades', label: 'Unidades', icon: Building },
  { href: '/cobranca', label: 'Cobrança', icon: Banknote },
  { href: '/contas', label: 'Contas a pagar', icon: FileText },
  { href: '/conciliacao', label: 'Conciliação', icon: Scale },
  { href: '/fechamento', label: 'Fechamento', icon: BookCheck },
  { href: '/comunicados', label: 'Comunicados', icon: Megaphone },
];

function Item({
  href,
  label,
  icon: Icon,
  active,
  nested = false,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active: boolean;
  nested?: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={`touch flex items-center gap-3 whitespace-nowrap rounded-xl px-3 py-2.5 font-semibold ${
          nested ? 'md:pl-6' : ''
        } ${active ? 'bg-sidebar-active text-on-sidebar' : 'text-on-sidebar/80 hover:bg-sidebar-active hover:text-on-sidebar'}`}
      >
        <Icon aria-hidden size={20} /> {label}
      </Link>
    </li>
  );
}

/**
 * Menu do painel. No celular vira uma faixa rolável horizontal; no desktop, coluna.
 * Dentro de um condomínio, as seções dele entram logo abaixo de "Condomínios".
 */
export function PainelNav() {
  const pathname = usePathname();
  const condoId = /^\/painel\/c\/([^/]+)/.exec(pathname)?.[1];
  const base = condoId ? `/painel/c/${condoId}` : null;

  return (
    <nav aria-label="Menu do painel" className="-mx-1 overflow-x-auto px-1 md:overflow-visible">
      <ul className="flex gap-1 md:flex-col">
        <Item href="/painel" label="Condomínios" icon={Building2} active={pathname === '/painel'} />
        {base &&
          condoSections.map((s) => {
            const href = `${base}${s.href}`;
            const active = s.href === '' ? pathname === base : pathname.startsWith(href);
            return <Item key={s.label} {...s} href={href} active={active} nested />;
          })}
      </ul>
    </nav>
  );
}
