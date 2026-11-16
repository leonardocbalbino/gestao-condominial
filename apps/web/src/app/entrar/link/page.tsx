'use client';

import { Globe, LoaderCircle, Smartphone } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { consumeMagicLinkAction } from '../actions';

/** Esquema do app do morador (apps/mobile/app.json). */
const APP_SCHEME = 'condominio';

/**
 * Destino do link mágico. O token vem no fragmento (#token=…), que o navegador não envia
 * ao servidor nem a logs. No computador entra direto; no celular a pessoa escolhe entre o
 * aplicativo e o navegador (o token é de uso único: vale onde for usado primeiro).
 */
export default function LinkMagicoPage() {
  const [error, setError] = useState<string | null>(null);
  const [mobileToken, setMobileToken] = useState<string | null>(null);

  const consume = (token: string) => {
    setMobileToken(null);
    void consumeMagicLinkAction(token).then((result) => {
      if (result?.error) setError(result.error);
    });
  };

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    // Tira o token da barra de endereço e do histórico.
    window.history.replaceState(null, '', window.location.pathname);
    if (!token) {
      setError('Link incompleto. Peça um novo link.');
      return;
    }
    if (/Android|iPhone|iPad/i.test(navigator.userAgent)) setMobileToken(token);
    else consume(token);
  }, []);

  return (
    <main
      id="conteudo"
      className="mx-auto flex max-w-md flex-col items-center gap-6 px-4 py-16 text-center"
    >
      {error ? (
        <>
          <p className="text-xl">{error}</p>
          <Link
            href="/entrar"
            className="touch rounded-lg bg-primary px-5 py-3 font-semibold text-on-primary"
          >
            Voltar para entrar
          </Link>
        </>
      ) : mobileToken ? (
        <>
          <p className="text-xl">Onde você quer entrar?</p>
          <a
            href={`${APP_SCHEME}://entrar/link?token=${encodeURIComponent(mobileToken)}`}
            className="touch flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 py-4 text-lg font-bold text-on-primary"
          >
            <Smartphone aria-hidden /> No aplicativo
          </a>
          <button
            type="button"
            onClick={() => consume(mobileToken)}
            className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-border bg-surface px-5 py-4 text-lg font-bold"
          >
            <Globe aria-hidden /> Neste navegador
          </button>
        </>
      ) : (
        <p className="flex items-center gap-3 text-xl" aria-live="polite">
          <LoaderCircle aria-hidden className="animate-spin" /> Entrando…
        </p>
      )}
    </main>
  );
}
