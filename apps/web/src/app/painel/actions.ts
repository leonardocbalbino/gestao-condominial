'use server';

import type { CondominioDto } from '@condo/contracts';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { api, errorMessage } from '@/lib/api';
import { text, type ActionState } from '@/lib/action-state';
import { staffContext } from '@/lib/context';
import { setGestora } from '@/lib/session';

export async function chooseGestoraAction(form: FormData): Promise<void> {
  const { gestoras } = await staffContext();
  const id = text(form, 'gestoraId');
  if (gestoras.some((g) => g.id === id)) await setGestora(id);
  redirect('/painel');
}

export async function createCondominioAction(_: ActionState, form: FormData): Promise<ActionState> {
  const { gestora } = await staffContext();
  let created: CondominioDto;
  try {
    created = await api<CondominioDto>('/condominios', {
      method: 'POST',
      gestoraId: gestora.id,
      body: { nome: text(form, 'nome'), cnpj: text(form, 'cnpj') },
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }
  revalidatePath('/painel');
  redirect(`/painel/c/${created.id}`);
}
