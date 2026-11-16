import type { ReactNode } from 'react';
import { CondoSwitcher } from '@/components/condo-switcher';
import { PainelNav } from '@/components/painel-nav';
import { PainelShell } from '@/components/painel-shell';
import { PreferenceControls } from '@/components/preferences';
import { UserMenu } from '@/components/user-menu';
import { staffCondominios, staffContext } from '@/lib/context';
import { gestoraLabel } from '@/lib/painel-sections';
import { themeStyle } from '@/lib/theme';
import { chooseGestoraAction } from './actions';

/**
 * Painel da gestora, síndico e conselho (ADR-0009): menu lateral escuro com a gestora,
 * seletor de condomínio e navegação; topo com breadcrumb e menu do usuário.
 */
export default async function PainelLayout({ children }: { children: ReactNode }) {
  const { me, gestoras, gestora } = await staffContext();
  const condos = (await staffCondominios()).map(({ id, nome }) => ({ id, nome }));
  const marca = gestoraLabel(gestora.nome);

  const sidebar = (
    <>
      <div>
        <p className="text-caption font-semibold uppercase tracking-wider text-on-sidebar-muted">
          Empresa gestora
        </p>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-card font-bold leading-tight">
          {marca.nome}
          {marca.demo && (
            <span
              title="Gestora de demonstração, com dados fictícios"
              className="rounded-full border border-on-sidebar/40 px-2 py-px text-caption font-semibold text-on-sidebar-muted"
            >
              Demo
            </span>
          )}
        </p>
        {gestoras.length > 1 && (
          <form action={chooseGestoraAction} className="mt-3 flex gap-2">
            <label className="sr-only" htmlFor="gestora">
              Trocar de gestora
            </label>
            <select
              id="gestora"
              name="gestoraId"
              defaultValue={gestora.id}
              className="h-10 min-w-0 flex-1 rounded-lg border border-on-sidebar/30 bg-sidebar-active px-2 text-on-sidebar"
            >
              {gestoras.map((g) => (
                <option key={g.id} value={g.id}>
                  {gestoraLabel(g.nome).nome}
                </option>
              ))}
            </select>
            <button className="h-10 rounded-lg border border-on-sidebar/30 px-3 font-semibold hover:bg-sidebar-active">
              Trocar
            </button>
          </form>
        )}
      </div>
      <CondoSwitcher condos={condos} />
      <PainelNav />
    </>
  );

  return (
    <div
      style={await themeStyle(gestora.branding.primaryColor)}
      className="painel bg-background text-text"
    >
      <PainelShell
        sidebar={sidebar}
        condos={condos}
        actions={
          <UserMenu email={me.email}>
            <PreferenceControls layout="menu" />
          </UserMenu>
        }
      >
        {children}
      </PainelShell>
    </div>
  );
}
