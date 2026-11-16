import type { MoradorHomeDto } from '@condo/contracts';
import { Banknote, CheckCheck, Grid2x2, Megaphone } from 'lucide-react';
import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { ChargeCard } from '@/components/charge-card';
import { Card } from '@/components/ui';
import { api } from '@/lib/api';
import { moradorContext, unitPath } from '@/lib/context';
import { markReadAction } from './actions';

/** Atalhos em cards grandes (ícone + uma palavra, dois por linha). Só módulos ligados. */
const atalhos = [
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

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold">{home.condominioNome}</h1>
        <p className="text-text-muted">Unidade {home.unidade}</p>
        {units.length > 1 && (
          <nav aria-label="Minhas unidades" className="mt-2 flex flex-wrap gap-2">
            {units.map((u) => (
              <Link
                key={u.unitId}
                href={`/morador?u=${u.unitId}`}
                className="touch inline-flex items-center underline"
              >
                {u.unitId === unit.unitId ? 'Esta unidade' : 'Outra unidade'}
              </Link>
            ))}
          </nav>
        )}
      </header>

      {home.pendencia && <ChargeCard charge={home.pendencia} unitId={unit.unitId} />}

      {home.comunicadosNaoLidos.map((a) => (
        <Card key={a.id} tone="warning">
          <h2 className="flex items-center gap-2 text-xl font-bold">
            <Megaphone aria-hidden /> {a.titulo}
          </h2>
          <p className="mt-2 whitespace-pre-line">{a.corpo}</p>
          <ActionForm action={markReadAction.bind(null, unit.unitId, a.id)} className="mt-4">
            <SubmitButton>
              <CheckCheck aria-hidden /> Li e entendi
            </SubmitButton>
          </ActionForm>
        </Card>
      ))}

      {home.avisosDoDia.length > 0 && (
        <Card>
          <h2 className="mb-2 text-xl font-bold">Hoje</h2>
          <ul>
            {home.avisosDoDia.map((a) => (
              <li key={a.texto}>{a.texto}</li>
            ))}
          </ul>
        </Card>
      )}

      <nav aria-label="Atalhos" className="grid grid-cols-2 gap-4">
        {atalhos.map(({ href, label, icon: Icon }) => (
          <Link
            key={label}
            href={`${href}${q}`}
            className="touch flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border-2 border-border bg-surface text-xl font-bold hover:border-primary"
          >
            <Icon aria-hidden size={40} className="text-primary" />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
