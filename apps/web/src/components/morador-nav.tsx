'use client';

import { Banknote, House, Megaphone, MessageCircle, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';

const items: { href: string; label: string; icon: LucideIcon; ariaLabel?: string }[] = [
  { href: '/morador', label: 'Início', icon: House },
  { href: '/morador/boletos', label: 'Boletos', icon: Banknote },
  { href: '/morador/comunicados', label: 'Avisos', icon: Megaphone },
  // O botão fixo "Falar com a gestora" (§7) mora na barra de baixo, sempre à mão.
  {
    href: '/morador/ajuda',
    label: 'Gestora',
    icon: MessageCircle,
    ariaLabel: 'Falar com a gestora',
  },
];

/** Barra fixa de baixo do morador: quatro destinos, ícone + texto, alvo grande. */
export function MoradorNav() {
  const pathname = usePathname();
  const u = useSearchParams().get('u');
  return (
    <nav
      aria-label="Navegação principal"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-divider bg-surface pb-[env(safe-area-inset-bottom)]"
    >
      <ul className="mx-auto grid max-w-2xl grid-cols-4">
        {items.map(({ href, label, icon: Icon, ariaLabel }) => {
          const active = href === '/morador' ? pathname === href : pathname.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={u ? `${href}?u=${u}` : href}
                aria-current={active ? 'page' : undefined}
                aria-label={ariaLabel}
                className={`touch flex min-h-16 flex-col items-center justify-center gap-0.5 text-sm font-bold ${
                  active ? 'text-primary' : 'text-text-muted hover:text-text'
                }`}
              >
                <Icon aria-hidden size={26} strokeWidth={active ? 2.5 : 2} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
