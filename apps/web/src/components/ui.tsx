import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

/**
 * Componentes básicos. Regras de acessibilidade do §7: alvo ≥ 48px, sempre ícone + texto,
 * contraste do tema (AA), foco visível (globals.css).
 */

const variants = {
  primary: 'bg-primary text-on-primary hover:opacity-90',
  secondary: 'bg-surface text-text border-2 border-border hover:border-primary hover:text-primary',
  danger: 'bg-danger text-on-danger hover:opacity-90',
  attention: 'bg-attention text-on-attention hover:opacity-90',
} as const;

type Variant = keyof typeof variants;

const buttonClass = (variant: Variant, extra = '') =>
  `touch inline-flex min-h-13 items-center justify-center gap-2 rounded-[14px] px-5 py-3 font-bold ${variants[variant]} disabled:opacity-60 ${extra}`;

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ComponentProps<'button'> & { variant?: Variant }) {
  return <button className={buttonClass(variant, className)} {...props} />;
}

export function ButtonLink({
  variant = 'primary',
  className = '',
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}

const cardTones = {
  neutral: 'bg-surface border border-divider',
  /** Ação esperada da pessoa (taxa a vencer): borda da cor principal. */
  primary: 'bg-surface border-2 border-primary',
  /** Atraso: laranja sobre fundo suave, mais forte que o neutro sem assustar. */
  attention: 'bg-attention-surface border-2 border-attention',
  danger: 'bg-surface border-4 border-danger',
  warning: 'bg-surface border-2 border-warning',
  success: 'bg-success-surface border border-success',
} as const;

export function Card({
  children,
  className = '',
  tone = 'neutral',
}: {
  children: ReactNode;
  className?: string;
  /** Destaque visual (ex.: pendência em atraso). */
  tone?: keyof typeof cardTones;
}) {
  return (
    <section className={`rounded-2xl p-5 ${cardTones[tone]} ${className}`}>{children}</section>
  );
}

export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-3xl font-bold">{title}</h1>
        {subtitle && <p className="mt-1 text-text-muted">{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function Field({
  label,
  hint,
  ...props
}: ComponentProps<'input'> & { label: string; hint?: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-semibold">{label}</span>
      <input
        className="min-h-13 rounded-xl border-2 border-border bg-surface px-3 py-2 text-text focus:border-primary"
        {...props}
      />
      {hint && <span className="text-sm text-text-muted">{hint}</span>}
    </label>
  );
}

export function SelectField({
  label,
  children,
  ...props
}: ComponentProps<'select'> & { label: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-semibold">{label}</span>
      <select
        className="min-h-13 rounded-xl border-2 border-border bg-surface px-3 py-2 text-text focus:border-primary"
        {...props}
      >
        {children}
      </select>
    </label>
  );
}

export function TextArea({ label, ...props }: ComponentProps<'textarea'> & { label: string }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-semibold">{label}</span>
      <textarea
        className="min-h-32 rounded-xl border-2 border-border bg-surface px-3 py-2 text-text focus:border-primary"
        {...props}
      />
    </label>
  );
}

const badgeTones = {
  neutral: 'bg-background text-text border-divider',
  info: 'bg-primary-soft text-on-primary-soft border-primary-soft',
  success: 'bg-success-surface text-on-success-surface border-success-surface',
  warning: 'bg-attention-surface text-on-attention-surface border-attention-surface',
  danger: 'bg-surface text-danger border-danger',
} as const;

export function Badge({
  children,
  tone = 'neutral',
}: {
  children: ReactNode;
  tone?: keyof typeof badgeTones;
}) {
  return (
    <span
      className={`inline-block rounded-full border px-3 py-0.5 text-sm font-bold ${badgeTones[tone]}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-xl border-2 border-dashed border-border p-6 text-center text-text-muted">
      {children}
    </p>
  );
}

/**
 * Tabela que vira lista de cartões no celular (§7: "tabelas viram cartões"). Cada coluna
 * declara o rótulo, usado como cabeçalho no desktop e como legenda no cartão.
 */
export function ResponsiveTable<T>({
  rows,
  columns,
  rowKey,
  empty = 'Nada por aqui ainda.',
}: {
  rows: T[];
  columns: { label: string; render: (row: T) => ReactNode; align?: 'right' }[];
  rowKey: (row: T) => string;
  empty?: string;
}) {
  if (rows.length === 0) return <EmptyState>{empty}</EmptyState>;
  return (
    <>
      <ul className="flex flex-col gap-3 md:hidden">
        {rows.map((row) => (
          <li key={rowKey(row)} className="rounded-2xl border border-divider bg-surface p-4">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
              {columns.map((c) => (
                <div key={c.label} className="contents">
                  <dt className="text-text-muted">{c.label}</dt>
                  <dd className="text-right font-medium">{c.render(row)}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
      <table className="hidden w-full border-collapse overflow-hidden rounded-2xl border border-divider bg-surface md:table">
        <thead>
          <tr className="border-b border-divider bg-background text-left text-sm text-text-muted">
            {columns.map((c) => (
              <th key={c.label} className={`px-4 py-3 ${c.align === 'right' ? 'text-right' : ''}`}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-b border-divider last:border-0">
              {columns.map((c) => (
                <td
                  key={c.label}
                  className={`px-4 py-3 ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
