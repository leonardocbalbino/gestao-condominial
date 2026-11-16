import { Inbox, type LucideIcon } from 'lucide-react';
import Link from 'next/link';
import type { ComponentProps, ReactNode } from 'react';

/**
 * Componentes básicos (ADR-0009). Os tamanhos são em rem: no painel (raiz de 16px) o
 * botão médio tem 44px e o pequeno 36px; no morador (raiz de 18px) os mesmos componentes
 * ficam com ≥ 48px, como pede o §7. Sempre ícone + texto, contraste AA e foco só por
 * teclado (globals.css).
 */

const variants = {
  primary: 'bg-primary text-on-primary hover:bg-primary-hover',
  secondary: 'border border-border bg-surface text-text hover:bg-background',
  ghost: 'bg-transparent text-primary hover:bg-primary-soft hover:text-on-primary-soft',
  danger: 'bg-danger text-on-danger hover:opacity-90',
  /** Pagar em atraso (morador). */
  attention: 'bg-attention text-on-attention hover:opacity-90',
} as const;

const sizes = {
  sm: 'min-h-9 px-3 text-label gap-1.5',
  md: 'min-h-11 px-4 gap-2',
} as const;

export type ButtonVariant = keyof typeof variants;
export type ButtonSize = keyof typeof sizes;

export interface ButtonStyle {
  variant?: ButtonVariant | undefined;
  size?: ButtonSize | undefined;
  /** Largura total: só quando pedido (ex.: ação principal no celular). */
  fullWidth?: boolean | undefined;
}

/**
 * Classes do botão, para quando o elemento não é `Button`/`ButtonLink` (link externo,
 * botão de formulário com estado). Regra: no máximo um `primary` por tela ou cartão.
 */
export function buttonClass({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
}: ButtonStyle = {}) {
  return [
    'touch inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-(--radius-control) font-semibold transition-colors',
    'disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50',
    variants[variant],
    sizes[size],
    // w-fit vence o "stretch" de colunas flex: o botão fica do tamanho do conteúdo.
    fullWidth ? 'w-full' : 'w-fit',
  ].join(' ');
}

export function Button({
  variant,
  size,
  fullWidth,
  className = '',
  type = 'button',
  ...props
}: ComponentProps<'button'> & ButtonStyle) {
  return (
    <button
      type={type}
      className={`${buttonClass({ variant, size, fullWidth })} ${className}`}
      {...props}
    />
  );
}

export function ButtonLink({
  variant,
  size,
  fullWidth,
  className = '',
  ...props
}: ComponentProps<typeof Link> & ButtonStyle) {
  return (
    <Link className={`${buttonClass({ variant, size, fullWidth })} ${className}`} {...props} />
  );
}

const cardTones = {
  neutral: 'bg-surface border border-divider shadow-card',
  /** Ação esperada da pessoa (taxa a vencer): borda da cor principal. */
  primary: 'bg-surface border-2 border-primary shadow-card',
  /** Atraso: laranja sobre fundo suave, mais forte que o neutro sem assustar. */
  attention: 'bg-attention-surface border-2 border-attention',
  danger: 'bg-surface border-4 border-danger',
  warning: 'bg-surface border-2 border-warning',
  success: 'bg-success-surface border border-success',
} as const;

/**
 * Cartão: fundo branco, borda 1px, raio 12px no painel, sombra leve, padding 24px.
 * `title`/`actions` montam o cabeçalho padrão (título 18/600 + ações à direita).
 */
export function Card({
  children,
  className = '',
  tone = 'neutral',
  title,
  actions,
}: {
  children: ReactNode;
  className?: string;
  /** Destaque visual (ex.: pendência em atraso). */
  tone?: keyof typeof cardTones;
  title?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className={`min-w-0 rounded-(--radius-card) p-6 ${cardTones[tone]} ${className}`}>
      {(title || actions) && (
        <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="text-card font-semibold">{title}</h2>}
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
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
        <h1 className="text-page font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-text-muted">{subtitle}</p>}
      </div>
      {action && <div className="flex flex-wrap items-center gap-2">{action}</div>}
    </header>
  );
}

/** Campo: label 14/600 acima; borda de controle ≥ 3:1 (WCAG 1.4.11), não a do cartão. */
const control =
  'w-full rounded-(--radius-control) border border-border bg-surface px-3 text-body text-text placeholder:text-text-muted focus:border-primary disabled:cursor-not-allowed disabled:bg-background';

function FieldShell({
  label,
  hint,
  error,
  className = '',
  children,
}: {
  label: string;
  hint?: string | undefined;
  /** Erro de validação: fica dentro do label, então o leitor de tela o lê com o campo. */
  error?: string | undefined;
  className?: string | undefined;
  children: ReactNode;
}) {
  return (
    <label className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <span className="text-label font-semibold">{label}</span>
      {children}
      {error ? (
        <span className="text-caption font-medium text-danger">{error}</span>
      ) : (
        hint && <span className="text-caption text-text-muted">{hint}</span>
      )}
    </label>
  );
}

/** A largura vem do grid do formulário (o campo ocupa a coluna, nunca a página). */
export function Field({
  label,
  hint,
  error,
  wrapperClassName,
  ...props
}: ComponentProps<'input'> & {
  label: string;
  hint?: string;
  error?: string | undefined;
  wrapperClassName?: string;
}) {
  return (
    <FieldShell label={label} hint={hint} error={error} className={wrapperClassName}>
      <input
        className={`h-11 ${control} ${error ? 'border-danger' : ''}`}
        aria-invalid={error ? true : undefined}
        {...props}
      />
    </FieldShell>
  );
}

export function SelectField({
  label,
  hint,
  wrapperClassName,
  children,
  ...props
}: ComponentProps<'select'> & { label: string; hint?: string; wrapperClassName?: string }) {
  return (
    <FieldShell label={label} hint={hint} className={wrapperClassName}>
      <select className={`h-11 ${control}`} {...props}>
        {children}
      </select>
    </FieldShell>
  );
}

export function TextArea({
  label,
  hint,
  wrapperClassName,
  ...props
}: ComponentProps<'textarea'> & { label: string; hint?: string; wrapperClassName?: string }) {
  return (
    <FieldShell label={label} hint={hint} className={wrapperClassName}>
      <textarea className={`min-h-28 py-2 ${control}`} {...props} />
    </FieldShell>
  );
}

const badgeTones = {
  neutral: 'bg-background text-text border-divider',
  info: 'bg-primary-soft text-info border-primary-soft',
  success: 'bg-success-surface text-on-success-surface border-success-surface',
  warning: 'bg-attention-surface text-on-attention-surface border-attention-surface',
  danger: 'bg-surface text-danger border-danger',
} as const;

export type BadgeTone = keyof typeof badgeTones;

export function Badge({
  children,
  tone = 'neutral',
  title,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  /** Explica o chip ao passar o mouse (ex.: por que está "Em implantação"). */
  title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-2.5 py-0.5 text-caption font-semibold ${badgeTones[tone]}`}
    >
      {children}
    </span>
  );
}

const statusChips = {
  aberto: { label: 'Aberto', tone: 'neutral' },
  em_revisao: { label: 'Em revisão', tone: 'info' },
  com_ressalva: { label: 'Com ressalva', tone: 'warning' },
  aprovada: { label: 'Aprovada', tone: 'info' },
  publicada: { label: 'Publicada', tone: 'success' },
  em_implantacao: { label: 'Em implantação', tone: 'neutral' },
  sem_cobranca: { label: 'Sem cobrança', tone: 'neutral' },
} as const satisfies Record<string, { label: string; tone: BadgeTone }>;

export type ChipStatus = keyof typeof statusChips;

/** Chip de status padronizado: mesmo texto e cor em todas as telas. */
export function StatusChip({ status, title }: { status: ChipStatus; title?: string }) {
  const { label, tone } = statusChips[status];
  return (
    <Badge tone={tone} {...(title ? { title } : {})}>
      {label}
    </Badge>
  );
}

/**
 * Estado vazio: ícone, título curto, uma frase dizendo o que falta e, se houver, a ação
 * que resolve. Nunca afirma que "está tudo certo" quando simplesmente não há dados.
 */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  children,
  action,
}: {
  icon?: LucideIcon;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-(--radius-card) border border-divider bg-surface px-6 py-10 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-primary-soft text-on-primary-soft">
        <Icon aria-hidden size={24} />
      </span>
      {title && <p className="text-card font-semibold">{title}</p>}
      {children && <p className="max-w-md text-text-muted">{children}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
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
          <li
            key={rowKey(row)}
            className="rounded-(--radius-card) border border-divider bg-surface p-4 shadow-card"
          >
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
      <div className="hidden overflow-x-auto rounded-(--radius-card) border border-divider bg-surface shadow-card md:block">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-divider bg-background text-left text-label text-text-muted">
              {columns.map((c) => (
                <th
                  key={c.label}
                  scope="col"
                  className={`px-4 py-3 font-semibold ${c.align === 'right' ? 'text-right' : ''}`}
                >
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
      </div>
    </>
  );
}
