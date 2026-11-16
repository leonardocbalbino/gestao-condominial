import { Card } from '@/components/ui';
import { PreferenceControls } from '@/components/preferences';

/**
 * "Mais": módulos que não estão nos atalhos e os ajustes de tela. Reservas, visitas,
 * encomendas e prestação de contas aparecem aqui quando a gestora ligar cada módulo
 * (Fases 2 e 3).
 */
export default function MaisPage() {
  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-[1.75rem] font-extrabold tracking-tight">Mais</h1>
      <Card>
        <p>Por enquanto, seu condomínio usa boletos e avisos por aqui.</p>
      </Card>
      <section id="ajustes" aria-labelledby="ajustes-titulo" className="scroll-mt-4">
        <h2 id="ajustes-titulo" className="mb-2 text-lg font-bold">
          Letra, contraste e conta
        </h2>
        <Card>
          <p className="mb-3 text-text-muted">
            Aumente a letra ou ligue o alto contraste se estiver difícil de ler.
          </p>
          <PreferenceControls />
        </Card>
      </section>
    </div>
  );
}
