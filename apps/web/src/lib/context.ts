import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import type { CondominioDto } from '@condo/contracts';
import { api, getMe, myUnits, staffGestoras } from './api';
import { COOKIES } from './session';

/** Gestora em uso no painel: a escolhida (se ainda válida) ou a primeira da pessoa. */
export const staffContext = cache(async () => {
  const me = await getMe();
  const gestoras = staffGestoras(me);
  if (gestoras.length === 0) redirect('/');
  const chosen = (await cookies()).get(COOKIES.gestora)?.value;
  const gestora = gestoras.find((g) => g.id === chosen) ?? gestoras[0];
  if (!gestora) redirect('/');
  return { me, gestoras, gestora };
});

/** Unidade em uso no portal do morador (`?u=<unitId>`), ou a primeira dele. */
export async function moradorContext(unitId?: string) {
  const me = await getMe();
  const units = myUnits(me);
  const unit = units.find((u) => u.unitId === unitId) ?? units[0];
  if (!unit) redirect('/');
  const branding = me.gestoras.find((g) => g.id === unit.gestoraId)?.branding ?? {};
  return { me, units, unit, branding };
}

/** Caminho base da API para a unidade do morador. */
export const unitPath = (u: { condominioId: string; unitId: string }) =>
  `/condominios/${u.condominioId}/units/${u.unitId}`;

/** Condomínios da gestora em uso (menu, seletor e visão consolidada; uma busca por request). */
export const staffCondominios = cache(async (): Promise<CondominioDto[]> => {
  const { gestora } = await staffContext();
  return api<CondominioDto[]>('/condominios', { gestoraId: gestora.id });
});
