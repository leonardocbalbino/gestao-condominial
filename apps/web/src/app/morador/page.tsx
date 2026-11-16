import type { MoradorHomeDto } from '@condo/contracts';
import {
  Banknote,
  Bell,
  CalendarCheck,
  CheckCheck,
  ChevronRight,
  Grid2x2,
  Megaphone,
  MessageCircle,
  type LucideIcon,
} from 'lucide-react';
import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { ChargeCard } from '@/components/charge-card';
import { Card } from '@/components/ui';
import { api } from '@/lib/api';
import { moradorContext, unitPath } from '@/lib/context';
import { markReadAction } from './actions';

/**
 * Atalhos em cards grandes (ícone + uma palavra, dois por linha). Só aparecem módulos
 * que existem e estão ligados; reservas, visitas, encomendas e contas entram nas Fases 2–3.
 */
const atalhos: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/morador/boletos', label: 'Boletos', icon: Banknote },
  { href: '/morador/comunicados', label: 'Avisos', icon: Megaphone },
  { href: '/morador/mais', label: 'Mais', icon: Grid2x2 },
];

/** Tela inicial na ordem do §7: pendência → comunicados não lidos → avisos do dia → atalhos. */
export default async function MoradorHome({
  searchParams,
}: {
  searchParams: Promise<{ u?: string }>;
}) {
  const { units, unit } = await moradorContext((await searchParams).u);
  const home = await api<MoradorHomeDto>(`${unitPath(unit)}/home`, { gestoraId: unit.gestoraId });
  const q = `?u=${unit.unitId}`;
  const naoLidos = home.comunicadosNaoLidos.length;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-[1.75rem] font-extrabold leading-tight tracking-tight">
            {home.primeiroNome ? `Olá, ${home.primeiroNome}` : 'Olá!'}
          </h1>
          <p className="mt-1 text-text-muted">
            {home.condominioNome} · {home.unidade}
          </p>
          {units.length > 1 && (
            <nav aria-label="Minhas unidades" className="mt-1 flex flex-wrap gap-x-4">
              {units.map((u, i) => (
                <Link
                  key={u.unitId}
                  href={`/morador?u=${u.unitId}`}
                  aria-current={u.unitId === unit.unitId ? 'page' : undefined}
                  className="touch inline-flex items-center font-semibold text-primary underline aria-[current=page]:text-text aria-[current=page]:no-underline"
                >
                  Unidade {i + 1}
                </Link>
              ))}
            </nav>
          )}
        </div>
        <Link
          href={`/morador/comunicados${q}`}
          aria-label={naoLidos > 0 ? `Avisos, ${naoLidos} não lidos` : 'Avisos'}
          className="touch relative flex size-12 shrink-0 items-center justify-center rounded-2xl border border-divider bg-surface hover:border-primary"
        >
          <Bell aria-hidden size={24} />
          {naoLidos > 0 && (
            <span className="absolute right-2.5 top-2.5 size-3 rounded-full border-2 border-surface bg-attention" />
          )}
        </Link>
      </header>

      {home.pendencia && <ChargeCard charge={home.pendencia} unitId={unit.unitId} />}

      {home.comunicadosNaoLidos.map((a) => (
        <Card key={a.id}>
          <p className="flex items-center gap-2 text-sm font-bold text-primary">
            <span aria-hidden className="size-2.5 rounded-full bg-primary" /> Comunicado novo
          </p>
          <h2 className="mt-2 text-xl font-bold leading-snug">{a.titulo}</h2>
          <p className="mt-2 whitespace-pre-line text-text-muted">{a.corpo}</p>
          <ActionForm action={markReadAction.bind(null, unit.unitId, a.id)} className="mt-4">
            <SubmitButton variant="secondary" fullWidth>
              <CheckCheck aria-hidden /> Li e entendi
            </SubmitButton>
          </ActionForm>
        </Card>
      ))}

      {home.avisosDoDia.length > 0 && (
        <section aria-labelledby="hoje">
          <h2 id="hoje" className="mb-2 text-lg font-bold">
            Hoje
          </h2>
          <ul className="flex flex-col gap-2">
            {home.avisosDoDia.map((a) => (
              <li
                key={a.texto}
                className="flex items-center gap-3 rounded-2xl border border-divider bg-surface p-3"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-on-primary-soft">
                  <CalendarCheck aria-hidden size={22} />
                </span>
                <span className="font-semibold">{a.texto}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="atalhos">
        <h2 id="atalhos" className="mb-2 text-lg font-bold">
          Atalhos
        </h2>
        <ul className="grid grid-cols-2 gap-3">
          {atalhos.map(({ href, label, icon: Icon }) => (
            <li key={label}>
              <Link
                href={`${href}${q}`}
                className="touch flex min-h-26 flex-col items-center justify-center gap-2 rounded-[18px] border border-divider bg-surface text-lg font-bold hover:border-primary"
              >
                <span className="flex size-12 items-center justify-center rounded-xl bg-primary-soft text-on-primary-soft">
                  <Icon aria-hidden size={26} />
                </span>
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <Link
        href={`/morador/ajuda${q}`}
        className="touch flex items-center gap-3 rounded-2xl border border-success bg-success-surface p-4 font-bold text-on-success-surface"
      >
        <MessageCircle aria-hidden size={26} />
        <span className="flex-1">Falar com a gestora</span>
        <ChevronRight aria-hidden />
      </Link>
    </div>
  );
}
