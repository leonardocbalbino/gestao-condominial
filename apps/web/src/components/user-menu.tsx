'use client';

import { ChevronDown } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

/**
 * Menu do usuário no topo (avatar): abre um painel com o e-mail e os ajustes (letra,
 * contraste, sair), que vêm do servidor como `children`. Esc ou clique fora fecham.
 */
export function UserMenu({ email, children }: { email: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const initial = email.trim().charAt(0).toUpperCase() || '?';

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panelRef.current?.contains(t) && !buttonRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);

  return (
    <div
      className="relative"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && open) {
          setOpen(false);
          buttonRef.current?.focus();
        }
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Conta e preferências (${email})`}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-10 items-center gap-1.5 rounded-full p-1 pr-2 hover:bg-background"
      >
        <span
          aria-hidden
          className="flex size-8 items-center justify-center rounded-full bg-primary-soft text-label font-bold text-on-primary-soft"
        >
          {initial}
        </span>
        <ChevronDown aria-hidden size={16} className="text-text-muted" />
      </button>
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          className="absolute right-0 top-full z-50 mt-2 w-72 rounded-(--radius-card) border border-divider bg-surface p-2 shadow-xl"
        >
          <p className="truncate px-3 py-2 text-label text-text-muted" title={email}>
            {email}
          </p>
          <div className="border-t border-divider pt-2">{children}</div>
        </div>
      )}
    </div>
  );
}
