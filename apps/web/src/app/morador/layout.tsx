import { MessageCircle } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { TopBar } from '@/components/top-bar';
import { moradorContext } from '@/lib/context';
import { themeStyle } from '@/lib/theme';

export default async function MoradorLayout({ children }: { children: ReactNode }) {
  const { unit, branding } = await moradorContext();
  return (
    <div
      style={await themeStyle(branding.primaryColor)}
      className="min-h-screen bg-background pb-28 text-text"
    >
      <TopBar title={unit.gestoraNome} home="/morador" />
      <main id="conteudo" className="mx-auto max-w-2xl px-4 py-6">
        {children}
      </main>
      {/* Botão fixo "Falar com a gestora" (§7). */}
      <Link
        href="/morador/ajuda"
        className="touch fixed bottom-4 right-4 inline-flex items-center gap-2 rounded-full bg-primary px-6 py-4 text-lg font-bold text-on-primary shadow-lg"
      >
        <MessageCircle aria-hidden /> Falar com a gestora
      </Link>
    </div>
  );
}
