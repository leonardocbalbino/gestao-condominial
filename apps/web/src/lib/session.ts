import 'server-only';
import { cookies } from 'next/headers';

/**
 * Sessão do web em cookies httpOnly (o token nunca fica acessível ao JavaScript da página).
 * O servidor do Next chama a API em nome do usuário (BFF), então não há CORS nem token
 * em localStorage.
 */
export const COOKIES = {
  access: 'condo_at',
  refresh: 'condo_rt',
  mfa: 'condo_mfa',
  gestora: 'condo_gestora',
  fontScale: 'condo_fs',
  highContrast: 'condo_hc',
} as const;

/** Em homologação por HTTP o cookie não pode ser `secure`; em produção (HTTPS), sim. */
const secure = process.env.COOKIE_SECURE === 'true';

const base = { httpOnly: true, sameSite: 'lax' as const, secure, path: '/' };

export async function setSession(tokens: { accessToken: string; refreshToken: string }) {
  const jar = await cookies();
  jar.set(COOKIES.access, tokens.accessToken, { ...base, maxAge: 15 * 60 });
  jar.set(COOKIES.refresh, tokens.refreshToken, { ...base, maxAge: 30 * 24 * 60 * 60 });
  jar.delete(COOKIES.mfa);
}

export async function setMfaToken(token: string) {
  (await cookies()).set(COOKIES.mfa, token, { ...base, maxAge: 5 * 60 });
}

export async function clearSession() {
  const jar = await cookies();
  for (const name of [COOKIES.access, COOKIES.refresh, COOKIES.mfa, COOKIES.gestora]) {
    jar.delete(name);
  }
}

export async function setGestora(gestoraId: string) {
  (await cookies()).set(COOKIES.gestora, gestoraId, { ...base, maxAge: 365 * 24 * 60 * 60 });
}

/** Preferências de leitura (não são segredo, mas ficam no servidor para renderizar certo). */
export async function readPreferences(): Promise<{ fontScale: number; highContrast: boolean }> {
  const jar = await cookies();
  const scale = Number(jar.get(COOKIES.fontScale)?.value ?? '1');
  return {
    fontScale: [1, 1.25, 1.5].includes(scale) ? scale : 1,
    highContrast: jar.get(COOKIES.highContrast)?.value === '1',
  };
}

export async function setPreferences(prefs: { fontScale?: number; highContrast?: boolean }) {
  const jar = await cookies();
  const opts = { ...base, httpOnly: false, maxAge: 365 * 24 * 60 * 60 };
  if (prefs.fontScale !== undefined) jar.set(COOKIES.fontScale, String(prefs.fontScale), opts);
  if (prefs.highContrast !== undefined) {
    jar.set(COOKIES.highContrast, prefs.highContrast ? '1' : '0', opts);
  }
}
