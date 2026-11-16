'use client';

import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { buttonClass, type ButtonStyle } from './ui';

type Kind = 'modal' | 'drawer';

const panel: Record<Kind, string> = {
  modal: 'm-auto w-[calc(100%-2rem)] max-w-lg rounded-(--radius-card)',
  drawer:
    'my-0 ml-auto mr-0 h-dvh max-h-dvh w-full max-w-md rounded-none sm:rounded-l-(--radius-card)',
};

/**
 * Modal ou gaveta lateral acessível, sobre o `<dialog>` nativo aberto com `showModal()`:
 * o resto da página fica inerte (foco preso no diálogo), `Esc` fecha, e o foco volta ao
 * botão que abriu. Clicar fora também fecha. O conteúdo (`children`) pode vir do servidor.
 */
function Dialog({
  kind,
  trigger,
  triggerStyle = { variant: 'secondary' },
  title,
  description,
  children,
  footer,
}: {
  kind: Kind;
  /** Conteúdo do botão que abre (ícone + texto). */
  trigger: ReactNode;
  triggerStyle?: ButtonStyle;
  title: string;
  description?: string;
  children: ReactNode;
  /** Ações no rodapé (ex.: botão de envio fora do formulário, "Cancelar"). */
  footer?: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    // Alguns navegadores não devolvem o foco sozinhos ao fechar.
    const restore = () => triggerRef.current?.focus();
    dialog.addEventListener('close', restore);
    return () => dialog.removeEventListener('close', restore);
  }, []);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        className={buttonClass(triggerStyle)}
        onClick={() => dialogRef.current?.showModal()}
      >
        {trigger}
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        className={`${panel[kind]} border border-divider bg-surface p-0 text-text shadow-xl backdrop:bg-text/40`}
        onClick={(e) => {
          if (e.target === dialogRef.current) dialogRef.current.close();
        }}
      >
        <div className="flex h-full flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-divider px-6 py-4">
            <div>
              <h2 id={titleId} className="text-card font-semibold">
                {title}
              </h2>
              {description && (
                <p id={descriptionId} className="mt-1 text-text-muted">
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              aria-label="Fechar"
              className={buttonClass({ variant: 'ghost', size: 'sm' })}
              onClick={() => dialogRef.current?.close()}
            >
              <X aria-hidden size={20} />
            </button>
          </header>
          <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
          {footer && (
            <footer className="flex flex-wrap justify-end gap-2 border-t border-divider px-6 py-4">
              {footer}
            </footer>
          )}
        </div>
      </dialog>
    </>
  );
}

type DialogProps = Omit<Parameters<typeof Dialog>[0], 'kind'>;

/** Diálogo centralizado (ex.: "Novo condomínio"). */
export function Modal(props: DialogProps) {
  return <Dialog kind="modal" {...props} />;
}

/** Gaveta pela direita para fluxos mais longos (ex.: passos da implantação). */
export function Drawer(props: DialogProps) {
  return <Dialog kind="drawer" {...props} />;
}

/** Fecha o diálogo onde está (ex.: "Cancelar" no rodapé). */
export function DialogClose({ children, ...style }: ButtonStyle & { children: ReactNode }) {
  return (
    <button
      type="button"
      className={buttonClass({ variant: 'secondary', ...style })}
      onClick={(e) => e.currentTarget.closest('dialog')?.close()}
    >
      {children}
    </button>
  );
}
