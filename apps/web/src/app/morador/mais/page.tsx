import Link from 'next/link';
import { Card } from '@/components/ui';

/**
 * "Mais": onde ficam os módulos que não estão nos atalhos. Reservas, visitas, encomendas
 * e prestação de contas aparecem aqui quando a gestora ligar cada módulo (Fases 2 e 3).
 */
export default async function MaisPage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string }>;
}) {
  const u = (await searchParams).u;
  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/morador${u ? `?u=${u}` : ''}`}
        className="touch inline-flex items-center text-primary underline"
      >
        ← Início
      </Link>
      <h1 className="text-2xl font-bold">Mais</h1>
      <Card>
        <p>Por enquanto, seu condomínio usa boletos e avisos por aqui.</p>
      </Card>
    </div>
  );
}
