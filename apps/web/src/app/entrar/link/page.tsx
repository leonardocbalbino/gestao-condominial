'use client';

import { LoaderCircle } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { consumeMagicLinkAction } from '../actions';

/**
 * Destino do link mágico. O token vem no fragmento (#token=…), que o navegador não envia
 * ao servidor nem a logs; esta página lê e troca pela sessão uma única vez.
 */
export default function LinkMagicoPage() {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get('token');
    // Tira o token da barra de endereço e do histórico.
    window.history.replaceState(null, '', window.location.pathname);
    if (!token) {
      setError('Link incompleto. Peça um novo link.');
      return;
    }
    void consumeMagicLinkAction(token).then((result) => {
      if (result?.error) setError(result.error);
    });
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
      ) : (
        <p className="flex items-center gap-3 text-xl" aria-live="polite">
          <LoaderCircle aria-hidden className="animate-spin" /> Entrando…
        </p>
      )}
    </main>
  );
}
