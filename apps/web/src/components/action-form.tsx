'use client';

import { CheckCircle2, LoaderCircle, TriangleAlert } from 'lucide-react';
import { useActionState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionState } from '@/lib/action-state';

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
          <p className="flex items-start gap-2 rounded-lg border-2 border-danger p-3 text-danger">
            <TriangleAlert aria-hidden className="mt-0.5 shrink-0" /> {state.error}
          </p>
        )}
        {state.ok && (
          <p className="flex items-start gap-2 rounded-lg border-2 border-success p-3 text-success">
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
  variant = 'primary',
}: {
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'danger';
}) {
  const { pending } = useFormStatus();
  const tone =
    variant === 'primary'
      ? 'bg-primary text-on-primary'
      : variant === 'danger'
        ? 'bg-danger text-on-danger'
        : 'bg-surface text-text border-2 border-border';
  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-lg px-5 py-3 font-semibold ${tone} disabled:opacity-60`}
    >
      {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : null}
      {children}
    </button>
  );
}
