'use server';

import { revalidatePath } from 'next/cache';
import { api, errorMessage } from '@/lib/api';
import type { ActionState } from '@/lib/action-state';
import { moradorContext, unitPath } from '@/lib/context';

/** "Li e entendi": confirmação registrada (e auditada) na API. */
export async function markReadAction(
  unitId: string,
  announcementId: string,
  _: ActionState,
): Promise<ActionState> {
  const { unit } = await moradorContext(unitId);
  try {
    await api(`${unitPath(unit)}/announcements/${announcementId}/read`, {
      method: 'POST',
      gestoraId: unit.gestoraId,
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }
  revalidatePath('/morador');
  return { ok: 'Leitura confirmada.' };
}
