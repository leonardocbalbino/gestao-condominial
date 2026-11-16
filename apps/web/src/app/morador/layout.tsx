import { Type } from 'lucide-react';
import Link from 'next/link';
import { Suspense, type ReactNode } from 'react';
import { MoradorNav } from '@/components/morador-nav';
import { moradorContext } from '@/lib/context';
import { themeStyle } from '@/lib/theme';

/**
 * Moldura do morador (layout aprovado, 390px primeiro): faixa fina com a gestora e o
 * atalho para ajustar letra/contraste; barra fixa de navegação embaixo.
 */
export default async function MoradorLayout({ children }: { children: ReactNode }) {
  const { unit, branding } = await moradorContext();
  return (
    <div
      style={await themeStyle(branding.primaryColor)}
      className="min-h-screen bg-background pb-28 text-text"
    >
      <div className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 pt-3">
        <Link
          href="/morador"
          className="touch inline-flex items-center text-sm font-semibold text-text-muted"
        >
          {unit.gestoraNome}
        </Link>
        <Link
          href="/morador/mais#ajustes"
          className="touch inline-flex items-center gap-1 rounded-xl px-2 text-sm font-semibold text-text-muted hover:text-primary"
        >
          <Type aria-hidden size={18} /> Letra e contraste
        </Link>
      </div>
      <main id="conteudo" className="mx-auto max-w-2xl px-4 pb-6 pt-2">
        {children}
      </main>
      <Suspense>
        <MoradorNav />
      </Suspense>
    </div>
  );
}
