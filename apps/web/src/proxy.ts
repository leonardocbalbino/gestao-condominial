import { NextResponse, type NextRequest } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:3333';
const ACCESS = 'condo_at';
const REFRESH = 'condo_rt';
const secure = process.env.COOKIE_SECURE === 'true';

/** O access token vence em menos de 30 s (ou já venceu)? Lê só o `exp`, sem validar. */
function expiresSoon(token: string | undefined): boolean {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split('.')[1] ?? '')) as { exp?: number };
    return !payload.exp || payload.exp * 1000 < Date.now() + 30_000;
  } catch {
    return true;
  }
}

type Tokens = { accessToken: string; refreshToken: string };

/**
 * Requisições simultâneas (o Next faz prefetch) chegariam com o MESMO refresh token, e a
 * API trata reuso como roubo e revoga a sessão. Aqui cada refresh token é trocado uma vez
 * só; quem chegar junto (ou logo depois) recebe o mesmo resultado.
 */
const inflight = new Map<string, Promise<Tokens | null>>();

function refreshOnce(refreshToken: string): Promise<Tokens | null> {
  let pending = inflight.get(refreshToken);
  if (!pending) {
    pending = fetch(`${API_URL}/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
      .then((r) => (r.ok ? (r.json() as Promise<Tokens>) : null))
      .catch(() => null);
    inflight.set(refreshToken, pending);
    setTimeout(() => inflight.delete(refreshToken), 30_000);
  }
  return pending;
}

/**
 * Antes de cada página: renova a sessão com o refresh token quando o access token está
 * vencendo, e manda para o login quem não tem sessão. A renovação vale para a própria
 * requisição (cookie reescrito no request) e para as seguintes (Set-Cookie).
 */
export async function proxy(request: NextRequest) {
  const access = request.cookies.get(ACCESS)?.value;
  const refresh = request.cookies.get(REFRESH)?.value;
  if (!expiresSoon(access)) return NextResponse.next();
  if (!refresh) return NextResponse.redirect(new URL('/entrar', request.url));

  const tokens = await refreshOnce(refresh);
  if (!tokens) {
    const out = NextResponse.redirect(new URL('/entrar', request.url));
    out.cookies.delete(ACCESS);
    out.cookies.delete(REFRESH);
    return out;
  }
  request.cookies.set(ACCESS, tokens.accessToken);
  request.cookies.set(REFRESH, tokens.refreshToken);
  const out = NextResponse.next({ request: { headers: request.headers } });
  const opts = { httpOnly: true, sameSite: 'lax' as const, secure, path: '/' };
  out.cookies.set(ACCESS, tokens.accessToken, { ...opts, maxAge: 15 * 60 });
  out.cookies.set(REFRESH, tokens.refreshToken, { ...opts, maxAge: 30 * 24 * 60 * 60 });
  return out;
}

export const config = {
  // Tudo menos login, arquivos estáticos, a rota de saúde e o catálogo /dev (404 em produção).
  matcher: ['/((?!entrar|_next/|favicon|saude|dev/).*)'],
};
