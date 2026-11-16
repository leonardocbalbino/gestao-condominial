'use client';

import { Check, ChevronsUpDown, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { parsePainelPath } from '@/lib/painel-sections';

const norm = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR');

/**
 * Seletor de condomínio no topo do menu: botão que abre uma busca com a lista filtrada.
 * Trocar de condomínio mantém a mesma seção (ex.: Cobrança → Cobrança do outro).
 * Esc fecha e devolve o foco ao botão.
 */
export function CondoSwitcher({ condos }: { condos: { id: string; nome: string }[] }) {
  const pathname = usePathname();
  const { condoId, suffix } = parsePainelPath(pathname);
  const current = condos.find((c) => c.id === condoId);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelId = useId();

  const close = (refocus: boolean) => {
    setOpen(false);
    setQuery('');
    if (refocus) buttonRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const outside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);

  const q = norm(query.trim());
  const filtered = q ? condos.filter((c) => norm(c.nome).includes(q)) : condos;

  return (
    <div
      className="relative"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          e.stopPropagation();
          close(true);
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => (open ? close(false) : setOpen(true))}
        className="flex min-h-12 w-full items-center gap-2 rounded-lg border border-on-sidebar/25 bg-sidebar-active px-3 py-2 text-left hover:border-on-sidebar/50"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-caption text-on-sidebar-muted">Condomínio</span>
          <span className="block truncate font-semibold">
            {current?.nome ?? 'Todos os condomínios'}
          </span>
        </span>
        <ChevronsUpDown aria-hidden size={18} className="shrink-0 text-on-sidebar-muted" />
      </button>

      {open && (
        <div
          ref={panelRef}
          id={panelId}
          className="absolute inset-x-0 top-full z-50 mt-1 rounded-lg border border-divider bg-surface p-2 text-text shadow-xl"
        >
          <label className="relative block">
            <span className="sr-only">Buscar condomínio</span>
            <Search
              aria-hidden
              size={16}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar condomínio"
              className="h-10 w-full rounded-md border border-border bg-surface pl-8 pr-2 text-body"
            />
          </label>
          <ul className="mt-2 max-h-72 overflow-y-auto" aria-live="polite">
            {!q && (
              <li>
                <Link
                  href="/painel"
                  onClick={() => close(false)}
                  aria-current={!condoId ? 'page' : undefined}
                  className="flex min-h-10 items-center gap-2 rounded-md px-2 py-1.5 hover:bg-background"
                >
                  <Check aria-hidden size={16} className={condoId ? 'invisible' : 'text-primary'} />
                  Todos os condomínios
                </Link>
              </li>
            )}
            {filtered.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/painel/c/${c.id}${suffix}`}
                  onClick={() => close(false)}
                  aria-current={c.id === condoId ? 'page' : undefined}
                  className="flex min-h-10 items-center gap-2 rounded-md px-2 py-1.5 hover:bg-background"
                >
                  <Check
                    aria-hidden
                    size={16}
                    className={c.id === condoId ? 'text-primary' : 'invisible'}
                  />
                  <span className="truncate">{c.nome}</span>
                </Link>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-2 py-3 text-label text-text-muted">
                Nenhum condomínio com “{query.trim()}”.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
