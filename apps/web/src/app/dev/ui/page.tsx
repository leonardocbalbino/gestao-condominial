import { createTheme, toCssVariables } from '@condo/ui';
import { Building2, Plus, Search, Trash2 } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { Drawer, DialogClose, Modal } from '@/components/dialog';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  PageHeader,
  SelectField,
  StatusChip,
  TextArea,
  type ButtonVariant,
} from '@/components/ui';

export const metadata = { title: 'Componentes (dev)' };

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'danger'];

/** Hover e foco simulados para comparar estados lado a lado (no uso real vêm do CSS). */
const hoverLook: Record<ButtonVariant, string> = {
  primary: 'bg-primary-hover!',
  secondary: 'bg-background!',
  ghost: 'bg-primary-soft! text-on-primary-soft!',
  danger: 'opacity-90',
  attention: 'opacity-90',
};
const focusLook = 'outline-2 outline-offset-2 outline-focus';

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid items-center gap-3 border-b border-divider py-3 last:border-0 md:grid-cols-[8rem_1fr]">
      <span className="text-caption font-medium text-text-muted">{label}</span>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

function Catalogo() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Título da página"
        subtitle="Subtítulo / legenda em texto secundário"
        action={
          <Button>
            <Plus aria-hidden size={18} /> Ação principal
          </Button>
        }
      />

      <Card title="Botões" actions={<Badge tone="info">um primário por cartão</Badge>}>
        {(['md', 'sm'] as const).map((size) => (
          <div key={size} className="mb-4">
            <p className="mb-1 text-label font-semibold">Tamanho {size}</p>
            <Row label="Normal">
              {VARIANTS.map((v) => (
                <Button key={v} variant={v} size={size}>
                  {v === 'danger' ? <Trash2 aria-hidden size={18} /> : null} {v}
                </Button>
              ))}
            </Row>
            <Row label="Hover">
              {VARIANTS.map((v) => (
                <Button key={v} variant={v} size={size} className={hoverLook[v]} tabIndex={-1}>
                  {v}
                </Button>
              ))}
            </Row>
            <Row label="Foco (teclado)">
              {VARIANTS.map((v) => (
                <Button key={v} variant={v} size={size} className={focusLook} tabIndex={-1}>
                  {v}
                </Button>
              ))}
            </Row>
            <Row label="Desabilitado">
              {VARIANTS.map((v) => (
                <Button key={v} variant={v} size={size} disabled>
                  {v}
                </Button>
              ))}
            </Row>
          </div>
        ))}
        <Row label="fullWidth">
          <Button fullWidth>Largura total (uso explícito, ex.: celular)</Button>
        </Row>
      </Card>

      <Card title="Campos">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Nome do condomínio" placeholder="Ex.: Residencial Ipê" />
          <Field label="CNPJ" hint="Só números" inputMode="numeric" />
          <SelectField label="Papel" defaultValue="sindico">
            <option value="sindico">Síndico</option>
            <option value="conselheiro">Conselheiro</option>
          </SelectField>
          <Field label="Desabilitado" disabled defaultValue="Não editável" />
          <Field
            label="Com foco (simulado)"
            className={`h-11 w-full rounded-(--radius-control) border border-primary bg-surface px-3 ${focusLook}`}
            tabIndex={-1}
          />
          <TextArea label="Observação" wrapperClassName="md:col-span-2" />
        </div>
      </Card>

      <Card title="Chips de status">
        <Row label="Prestação">
          <StatusChip status="aberto" />
          <StatusChip status="em_revisao" />
          <StatusChip status="com_ressalva" />
          <StatusChip status="publicada" />
          <StatusChip status="sem_cobranca" title="Nenhuma cobrança emitida neste mês" />
        </Row>
        <Row label="Badge">
          <Badge>neutro</Badge>
          <Badge tone="info">info</Badge>
          <Badge tone="success">sucesso</Badge>
          <Badge tone="warning">alerta</Badge>
          <Badge tone="danger">erro</Badge>
        </Row>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <EmptyState
          icon={Search}
          title="Ainda não há conciliações"
          action={<Button variant="secondary">Conectar conta</Button>}
        >
          Elas aparecem aqui depois que a conta de pagamentos de um condomínio for conectada.
        </EmptyState>
        <EmptyState title="Sem ação">Estado vazio só com explicação.</EmptyState>
      </div>

      <Card
        title="Modal e gaveta"
        actions={
          <span className="text-caption text-text-muted">Esc fecha; o foco volta ao botão</span>
        }
      >
        <div className="flex flex-wrap gap-3">
          <Modal
            trigger={
              <>
                <Plus aria-hidden size={18} /> Abrir modal
              </>
            }
            triggerStyle={{ variant: 'primary' }}
            title="Novo condomínio"
            description="Nome e CNPJ; o resto se configura depois."
            footer={
              <>
                <DialogClose>Cancelar</DialogClose>
                <Button>Criar</Button>
              </>
            }
          >
            <div className="grid gap-4">
              <Field label="Nome" />
              <Field label="CNPJ" inputMode="numeric" />
            </div>
          </Modal>
          <Drawer
            trigger={
              <>
                <Building2 aria-hidden size={18} /> Abrir gaveta
              </>
            }
            title="Abrir a conta de pagamentos"
            description="Subconta do condomínio no broker."
          >
            <p className="text-text-muted">Conteúdo longo de um passo da implantação.</p>
          </Drawer>
        </div>
      </Card>
    </div>
  );
}

/**
 * Catálogo de componentes do painel (só em desenvolvimento): tema padrão e modo
 * Contraste lado a lado, para conferir estados e contraste sem navegar pelo sistema.
 */
export default function DevUiPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  const contraste = toCssVariables(createTheme({ highContrast: true })) as CSSProperties;
  return (
    <div className="painel min-h-screen bg-background text-text">
      <main
        id="conteudo"
        className="mx-auto grid max-w-7xl grid-cols-[minmax(0,1fr)] gap-10 px-4 py-8 2xl:grid-cols-2"
      >
        <section aria-label="Tema padrão">
          <p className="mb-4 text-caption font-semibold uppercase tracking-wider text-text-muted">
            Tema padrão
          </p>
          <Catalogo />
        </section>
        <section
          aria-label="Modo contraste"
          style={contraste}
          className="bg-background p-4 text-text"
        >
          <p className="mb-4 text-caption font-semibold uppercase tracking-wider text-text-muted">
            Modo contraste
          </p>
          <Catalogo />
        </section>
      </main>
    </div>
  );
}
