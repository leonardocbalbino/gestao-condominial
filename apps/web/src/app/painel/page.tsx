import type { CondominioDto } from '@condo/contracts';
import { Building2, Plus } from 'lucide-react';
import Link from 'next/link';
import { ActionForm, SubmitButton } from '@/components/action-form';
import { Card, EmptyState, Field, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { staffContext } from '@/lib/context';
import { createCondominioAction } from './actions';

export default async function PainelPage() {
  const { gestora } = await staffContext();
  const condominios = await api<CondominioDto[]>('/condominios', { gestoraId: gestora.id });
  const isAdmin = gestora.roles.some((r) => r.key === 'gestora_admin');

  return (
    <>
      <PageHeader title="Condomínios" subtitle={`${condominios.length} na sua carteira`} />
      {condominios.length === 0 ? (
        <EmptyState>Nenhum condomínio por aqui ainda.</EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {condominios.map((c) => (
            <li key={c.id}>
              <Link
                href={`/painel/c/${c.id}`}
                className="touch flex h-full items-center gap-3 rounded-xl border-2 border-border bg-surface p-5 hover:border-primary"
              >
                <Building2 aria-hidden className="shrink-0 text-primary" size={32} />
                <span>
                  <span className="block text-lg font-bold">{c.nome}</span>
                  <span className="text-text-muted">CNPJ {c.cnpj}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {isAdmin && (
        <Card className="mt-8 max-w-lg">
          <h2 className="mb-4 flex items-center gap-2 text-xl font-bold">
            <Plus aria-hidden /> Novo condomínio
          </h2>
          <ActionForm action={createCondominioAction}>
            <Field label="Nome" name="nome" required minLength={2} />
            <Field label="CNPJ" name="cnpj" inputMode="numeric" required />
            <SubmitButton>
              <Plus aria-hidden /> Criar condomínio
            </SubmitButton>
          </ActionForm>
        </Card>
      )}
    </>
  );
}
