import { redirect } from 'next/navigation';
import { getMe, isStaff, myUnits } from '@/lib/api';

/** Encaminha cada pessoa para a área dela: painel (equipe) ou portal do morador. */
export default async function Home() {
  const me = await getMe();
  if (isStaff(me)) redirect('/painel');
  if (myUnits(me).length > 0) redirect('/morador');
  return (
    <main id="conteudo" className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="mb-4 text-2xl font-bold">Seu acesso ainda não foi liberado</h1>
      <p className="text-text-muted">
        Peça à administradora do seu condomínio para vincular você à sua unidade.
      </p>
    </main>
  );
}
