import type { AnnouncementStatsDto } from '@condo/contracts';
import { Megaphone, Users } from 'lucide-react';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { Card, EmptyState, Field, TextArea } from '@/components/ui';
import { load } from '@/lib/load';
import { publishAnnouncementAction } from '../actions';

export default async function ComunicadosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const announcements = await load<AnnouncementStatsDto[]>(`/condominios/${id}/announcements`);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_24rem]">
      <section className="flex flex-col gap-4">
        <h2 className="text-2xl font-bold">Comunicados</h2>
        {!announcements || announcements.length === 0 ? (
          <EmptyState>Nenhum comunicado publicado.</EmptyState>
        ) : (
          announcements.map((a) => (
            <Card key={a.id}>
              <p className="text-lg font-bold">{a.titulo}</p>
              <p className="whitespace-pre-line">{a.corpo}</p>
              <p className="mt-3 flex items-center gap-2 text-text-muted">
                <Users aria-hidden /> {a.confirmacoes} confirmaram a leitura ·{' '}
                {new Date(a.publicadoEm).toLocaleDateString('pt-BR')}
              </p>
            </Card>
          ))
        )}
      </section>
      <Card className="h-fit">
        <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
          <Megaphone aria-hidden /> Novo comunicado
        </h2>
        <ActionForm action={publishAnnouncementAction.bind(null, id)}>
          <Field label="Título" name="titulo" required minLength={3} maxLength={120} />
          <TextArea label="Mensagem" name="corpo" required minLength={3} maxLength={5000} />
          <SubmitButton>
            <Megaphone aria-hidden /> Publicar
          </SubmitButton>
        </ActionForm>
      </Card>
    </div>
  );
}
