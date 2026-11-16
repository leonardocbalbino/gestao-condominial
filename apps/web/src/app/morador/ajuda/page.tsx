import Link from 'next/link';
import { Card } from '@/components/ui';
import { moradorContext } from '@/lib/context';

/** Destino do botão fixo "Falar com a gestora". */
export default async function AjudaPage() {
  const { unit } = await moradorContext();
  return (
    <div className="flex flex-col gap-4">
      <Link href="/morador" className="touch inline-flex items-center text-primary underline">
        ← Início
      </Link>
      <h1 className="text-2xl font-bold">Falar com a gestora</h1>
      <Card>
        <p className="text-lg">
          Quem cuida do seu condomínio é a <strong>{unit.gestoraNome}</strong>.
        </p>
        <p className="mt-2 text-text-muted">
          Use o telefone ou e-mail que a administradora informou no último comunicado. O atendimento
          por mensagens dentro do aplicativo chega em breve.
        </p>
      </Card>
    </div>
  );
}
