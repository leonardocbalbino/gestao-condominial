'use client';

import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { parsePainelPath } from '@/lib/painel-sections';

const DESKTOP = '(min-width: 1024px)';

function useIsDesktop(): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mq = window.matchMedia(DESKTOP);
      mq.addEventListener('change', notify);
      return () => mq.removeEventListener('change', notify);
    },
    () => window.matchMedia(DESKTOP).matches,
    // No servidor não há tela: assume desktop (menu visível, sem "inert").
    () => true,
  );
}

/** "Condomínios / Edifício Jacarandá / Cobrança", a partir da rota. */
function Breadcrumb({ condos }: { condos: { id: string; nome: string }[] }) {
  const pathname = usePathname();
  const { condoId, section } = parsePainelPath(pathname);
  const condo = condos.find((c) => c.id === condoId);
  const crumbs: { label: string; href: string }[] = [{ label: 'Condomínios', href: '/painel' }];
  if (condoId) crumbs.push({ label: condo?.nome ?? 'Condomínio', href: `/painel/c/${condoId}` });
  if (condoId && section && section.href !== '') {
    crumbs.push({ label: section.label, href: `/painel/c/${condoId}${section.href}` });
  }
  return (
    <nav aria-label="Você está em" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-label text-text-muted">
        {crumbs.map((c, i) => {
          const last = i === crumbs.length - 1;
          return (
            <li
              key={c.href}
              className={`flex min-w-0 items-center gap-1.5 ${last ? '' : 'max-sm:hidden'}`}
            >
              {last ? (
                <span aria-current="page" className="truncate font-medium text-text">
                  {c.label}
                </span>
              ) : (
                <>
                  <Link href={c.href} className="truncate hover:text-primary hover:underline">
                    {c.label}
                  </Link>
                  {/* A barra vai com o item: some junto quando ele some no celular. */}
                  <span aria-hidden>/</span>
                </>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/**
 * Moldura do painel: menu lateral fixo a partir de 1024px; abaixo disso, gaveta aberta
 * pelo botão "Menu" no topo (Esc fecha e devolve o foco). Topo de 64px com breadcrumb à
 * esquerda e as ações da conta à direita.
 */
export function PainelShell({
  sidebar,
  actions,
  condos,
  children,
}: {
  sidebar: ReactNode;
  actions: ReactNode;
  condos: { id: string; nome: string }[];
  children: ReactNode;
}) {
  const isDesktop = useIsDesktop();
  const [open, setOpen] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  const asideRef = useRef<HTMLElement>(null);
  const drawerOpen = open && !isDesktop;

  useEffect(() => {
    if (drawerOpen) asideRef.current?.querySelector<HTMLElement>('a, button')?.focus();
  }, [drawerOpen]);

  const close = () => {
    setOpen(false);
    menuButton.current?.focus();
  };

  return (
    <div className="min-h-screen lg:flex">
      {drawerOpen && <div aria-hidden className="fixed inset-0 z-30 bg-text/40" onClick={close} />}
      <aside
        id="menu-painel"
        ref={asideRef}
        aria-label="Menu"
        inert={!isDesktop && !open}
        {...(drawerOpen ? { role: 'dialog', 'aria-modal': true } : {})}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && drawerOpen) close();
        }}
        onClick={(e) => {
          // Navegar por um link fecha a gaveta.
          if (drawerOpen && (e.target as HTMLElement).closest('a')) setOpen(false);
        }}
        className={`fixed inset-y-0 left-0 z-40 flex w-72 max-w-[85vw] flex-col gap-6 overflow-y-auto bg-sidebar p-5 text-on-sidebar transition-transform lg:sticky lg:top-0 lg:h-screen lg:w-64 lg:max-w-none lg:translate-x-0 ${
          open ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {drawerOpen && (
          <button
            type="button"
            onClick={close}
            className="flex min-h-10 items-center gap-2 self-end rounded-lg px-2 text-on-sidebar-muted hover:bg-sidebar-active hover:text-on-sidebar"
          >
            <X aria-hidden size={18} /> Fechar menu
          </button>
        )}
        {sidebar}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-divider bg-surface px-4 lg:px-8">
          <button
            ref={menuButton}
            type="button"
            aria-expanded={open}
            aria-controls="menu-painel"
            onClick={() => setOpen(true)}
            className="flex min-h-10 shrink-0 items-center gap-2 rounded-lg px-2 font-semibold hover:bg-background lg:hidden"
          >
            <Menu aria-hidden size={20} /> Menu
          </button>
          <Breadcrumb condos={condos} />
          <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>
        </header>
        <main id="conteudo" className="min-w-0 flex-1 px-4 py-6 lg:px-8 lg:py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
