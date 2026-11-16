'use client';

import { ArrowLeft, Building2, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useId } from 'react';
import { condoGroups, configuracoes, parsePainelPath, visaoGeral } from '@/lib/painel-sections';

function Item({
  href,
  label,
  icon: Icon,
  active = false,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  active?: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? 'page' : undefined}
        className={`flex min-h-10 items-center gap-3 rounded-lg px-3 py-2 ${
          active
            ? 'bg-sidebar-active font-semibold text-on-sidebar shadow-[inset_3px_0_0_var(--color-primary)]'
            : 'font-medium text-on-sidebar-muted hover:bg-sidebar-active hover:text-on-sidebar'
        }`}
      >
        <Icon aria-hidden size={18} /> {label}
      </Link>
    </li>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  const id = useId();
  return (
    <div>
      <p
        id={id}
        className="mb-1 px-3 text-caption font-semibold uppercase tracking-wider text-on-sidebar-muted"
      >
        {title}
      </p>
      <ul aria-labelledby={id} className="flex flex-col gap-0.5">
        {children}
      </ul>
    </div>
  );
}

/**
 * Menu do painel. Fora de um condomínio: a carteira. Dentro de um condomínio: só os itens
 * dele, em grupos, e "← Todos os condomínios" para voltar.
 */
export function PainelNav() {
  const pathname = usePathname();
  const { condoId } = parsePainelPath(pathname);

  if (!condoId) {
    return (
      <nav aria-label="Menu do painel">
        <ul className="flex flex-col gap-0.5">
          <Item
            href="/painel"
            label="Condomínios"
            icon={Building2}
            active={pathname === '/painel'}
          />
        </ul>
      </nav>
    );
  }

  const base = `/painel/c/${condoId}`;
  const isActive = (href: string) =>
    href === '' ? pathname === base : pathname.startsWith(`${base}${href}`);

  return (
    <nav aria-label="Menu do condomínio" className="flex flex-col gap-5">
      <ul className="flex flex-col gap-0.5">
        <Item href="/painel" label="Todos os condomínios" icon={ArrowLeft} />
        <Item {...visaoGeral} href={base} active={isActive('')} />
      </ul>
      {condoGroups.map((g) => (
        <Group key={g.title} title={g.title}>
          {g.items.map((s) => (
            <Item key={s.href} {...s} href={`${base}${s.href}`} active={isActive(s.href)} />
          ))}
        </Group>
      ))}
      <ul className="flex flex-col gap-0.5 border-t border-on-sidebar/15 pt-4">
        <Item
          {...configuracoes}
          href={`${base}${configuracoes.href}`}
          active={isActive(configuracoes.href)}
        />
      </ul>
    </nav>
  );
}
