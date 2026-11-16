import { Contrast, LogOut, Minus, Plus } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { changeFontSize, toggleHighContrast } from '@/app/preferences-actions';
import { logoutAction } from '@/app/entrar/actions';

const iconButton =
  'inline-flex min-h-12 min-w-12 items-center justify-center gap-1 rounded-lg border-2 border-border bg-surface px-3 font-semibold text-text hover:border-primary';

/** Barra do topo: nome, ajuste de fonte, alto contraste e sair (sempre ícone + texto). */
export function TopBar({
  title,
  home,
  children,
}: {
  title: string;
  home: string;
  children?: ReactNode;
}) {
  return (
    <header className="border-b-2 border-border bg-surface">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href={home} className="touch flex items-center text-xl font-bold">
          {title}
        </Link>
        <nav aria-label="Preferências e conta" className="flex flex-wrap items-center gap-2">
          {children}
          <form action={changeFontSize.bind(null, 'down')}>
            <button className={iconButton} aria-label="Diminuir letra">
              <Minus aria-hidden /> A
            </button>
          </form>
          <form action={changeFontSize.bind(null, 'up')}>
            <button className={iconButton} aria-label="Aumentar letra">
              <Plus aria-hidden /> A
            </button>
          </form>
          <form action={toggleHighContrast}>
            <button className={iconButton}>
              <Contrast aria-hidden /> Contraste
            </button>
          </form>
          <form action={logoutAction}>
            <button className={iconButton}>
              <LogOut aria-hidden /> Sair
            </button>
          </form>
        </nav>
      </div>
    </header>
  );
}
