'use client';

import { CheckCircle2, LoaderCircle, TriangleAlert } from 'lucide-react';
import { useActionState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionState } from '@/lib/action-state';
import { buttonClass, type ButtonStyle } from './ui';

/**
 * Formulário ligado a uma server action. Mostra o resultado (sucesso ou erro) logo abaixo,
 * anunciado para leitores de tela (aria-live).
 */
export function ActionForm({
  action,
  children,
  className = 'flex flex-col gap-4',
}: {
  action: (state: ActionState, form: FormData) => Promise<ActionState>;
  children: ReactNode;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, {});
  return (
    <form action={formAction} className={className}>
      {children}
      <div aria-live="polite">
        {state.error && (
          <p className="flex items-start gap-2 rounded-xl border-2 border-danger p-3 text-danger">
            <TriangleAlert aria-hidden className="mt-0.5 shrink-0" /> {state.error}
          </p>
        )}
        {state.ok && (
          <p className="flex items-start gap-2 rounded-xl border-2 border-success p-3 text-success">
            <CheckCircle2 aria-hidden className="mt-0.5 shrink-0" /> {state.ok}
          </p>
        )}
      </div>
    </form>
  );
}

/** Botão de envio com estado "enviando" (desabilita para não enviar duas vezes). */
export function SubmitButton({
  children,
  className = '',
  ...style
}: ButtonStyle & {
  children: ReactNode;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`${buttonClass(style)} ${className}`}
    >
      {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : null}
      {children}
    </button>
  );
}
