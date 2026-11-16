import type { ReactNode } from 'react';
import { PainelNav } from '@/components/painel-nav';
import { PreferenceControls } from '@/components/preferences';
import { staffContext } from '@/lib/context';
import { themeStyle } from '@/lib/theme';
import { chooseGestoraAction } from './actions';

/**
 * Painel da gestora, síndico e conselho (layout aprovado): menu lateral escuro com a
 * gestora, troca de gestora, navegação e ajustes de tela. No celular, o menu vem em cima.
 */
export default async function PainelLayout({ children }: { children: ReactNode }) {
  const { gestoras, gestora } = await staffContext();
  return (
    <div
      style={await themeStyle(gestora.branding.primaryColor)}
      className="min-h-screen bg-background text-text md:flex"
    >
      <aside className="flex flex-col gap-4 bg-sidebar p-4 text-on-sidebar md:sticky md:top-0 md:h-screen md:w-64 md:shrink-0 md:gap-6 md:overflow-y-auto md:p-5">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-on-sidebar/70">
            Empresa gestora
          </p>
          <p className="mt-1 text-lg font-extrabold leading-tight">{gestora.nome}</p>
          {gestoras.length > 1 && (
            <form action={chooseGestoraAction} className="mt-3 flex gap-2">
              <label className="sr-only" htmlFor="gestora">
                Trocar de gestora
              </label>
              <select
                id="gestora"
                name="gestoraId"
                defaultValue={gestora.id}
                className="min-h-12 min-w-0 flex-1 rounded-xl border border-on-sidebar/30 bg-sidebar-active px-2 text-on-sidebar"
              >
                {gestoras.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nome}
                  </option>
                ))}
              </select>
              <button className="min-h-12 rounded-xl border border-on-sidebar/30 px-3 font-semibold hover:bg-sidebar-active">
                Trocar
              </button>
            </form>
          )}
        </div>
        <PainelNav />
        <div className="md:mt-auto">
          <PreferenceControls tone="dark" />
        </div>
      </aside>
      <main id="conteudo" className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
