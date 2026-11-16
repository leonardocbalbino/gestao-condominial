'use server';

import type { AuthStepResult } from '@condo/contracts';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { api, errorMessage } from '@/lib/api';
import { text, type ActionState } from '@/lib/action-state';
import { clearSession, COOKIES, setMfaToken, setSession } from '@/lib/session';

/** Para onde vai depois de cada passo do login. */
async function proceed(result: AuthStepResult): Promise<never> {
  if (result.status === 'authenticated') {
    await setSession(result);
    redirect('/');
  }
  await setMfaToken(result.mfaToken);
  redirect(result.status === 'mfa_enrollment_required' ? '/entrar/2fa?novo=1' : '/entrar/2fa');
}

export async function loginAction(_: ActionState, form: FormData): Promise<ActionState> {
  let result: AuthStepResult;
  try {
    result = await api<AuthStepResult>('/auth/login', {
      method: 'POST',
      anonymous: true,
      gestoraId: null,
      body: { email: text(form, 'email'), password: text(form, 'password') },
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }
  return proceed(result);
}

export async function verifyMfaAction(_: ActionState, form: FormData): Promise<ActionState> {
  const mfaToken = (await cookies()).get(COOKIES.mfa)?.value;
  if (!mfaToken) return { error: 'O tempo para digitar o código acabou. Entre de novo.' };
  let result: AuthStepResult;
  try {
    result = await api<AuthStepResult>('/auth/mfa/verify', {
      method: 'POST',
      anonymous: true,
      gestoraId: null,
      body: { mfaToken, code: text(form, 'code').replace(/\D/g, '') },
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }
  return proceed(result);
}

export async function requestMagicLinkAction(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    await api('/auth/magic-link', {
      method: 'POST',
      anonymous: true,
      gestoraId: null,
      body: { email: text(form, 'email') },
    });
  } catch (error) {
    return { error: errorMessage(error) };
  }
  // Mesma resposta exista ou não o e-mail (não revela quem tem cadastro).
  return {
    ok: 'Se este e-mail tiver cadastro, enviamos um link para entrar. Ele vale por 15 minutos.',
  };
}

/** Link mágico: o token chega no fragmento da URL e é trocado aqui pela sessão. */
export async function consumeMagicLinkAction(token: string): Promise<ActionState> {
  let result: AuthStepResult;
  try {
    result = await api<AuthStepResult>('/auth/magic-link/consume', {
      method: 'POST',
      anonymous: true,
      gestoraId: null,
      body: { token },
    });
  } catch {
    return { error: 'Este link já foi usado ou expirou. Peça um novo.' };
  }
  return proceed(result);
}

export async function logoutAction(): Promise<void> {
  const refreshToken = (await cookies()).get(COOKIES.refresh)?.value;
  if (refreshToken) {
    await api('/auth/logout', {
      method: 'POST',
      anonymous: true,
      gestoraId: null,
      body: { refreshToken },
    }).catch(() => undefined);
  }
  await clearSession();
  redirect('/entrar');
}
