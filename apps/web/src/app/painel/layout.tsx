import type { ReactNode } from 'react';
import { TopBar } from '@/components/top-bar';
import { staffContext } from '@/lib/context';
import { themeStyle } from '@/lib/theme';
import { chooseGestoraAction } from './actions';

/** Painel da gestora, síndico e conselho, com a identidade visual da gestora. */
export default async function PainelLayout({ children }: { children: ReactNode }) {
  const { gestoras, gestora } = await staffContext();
  return (
    <div
      style={await themeStyle(gestora.branding.primaryColor)}
      className="min-h-screen bg-background text-text"
    >
      <TopBar title={gestora.nome} home="/painel">
        {gestoras.length > 1 && (
          <form action={chooseGestoraAction} className="flex items-center gap-2">
            <label className="sr-only" htmlFor="gestora">
              Gestora
            </label>
            <select
              id="gestora"
              name="gestoraId"
              defaultValue={gestora.id}
              className="min-h-12 rounded-lg border-2 border-border bg-surface px-3"
            >
              {gestoras.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nome}
                </option>
              ))}
            </select>
            <button className="min-h-12 rounded-lg border-2 border-border bg-surface px-3 font-semibold">
              Trocar
            </button>
          </form>
        )}
      </TopBar>
      <main id="conteudo" className="mx-auto max-w-6xl px-4 py-6">
        {children}
      </main>
    </div>
  );
}
