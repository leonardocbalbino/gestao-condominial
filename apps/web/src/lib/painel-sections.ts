import {
  Banknote,
  BookCheck,
  Building,
  FileText,
  LayoutDashboard,
  Megaphone,
  Scale,
  type LucideIcon,
} from 'lucide-react';

export interface CondoSection {
  /** Sufixo da rota dentro de `/painel/c/[id]` ('' = visão geral). */
  href: string;
  label: string;
  icon: LucideIcon;
}

export const visaoGeral: CondoSection = { href: '', label: 'Visão geral', icon: LayoutDashboard };

/**
 * Menu do condomínio em grupos. "Prestação de contas" entra em Fechamento quando a
 * tela existir (Fase 2); até lá, o item não aparece.
 */
export const condoGroups: { title: string; items: CondoSection[] }[] = [
  {
    title: 'Operação',
    items: [
      { href: '/unidades', label: 'Unidades', icon: Building },
      { href: '/cobranca', label: 'Cobrança', icon: Banknote },
      { href: '/contas', label: 'Contas a pagar', icon: FileText },
      { href: '/comunicados', label: 'Comunicados', icon: Megaphone },
    ],
  },
  {
    title: 'Fechamento',
    items: [
      { href: '/conciliacao', label: 'Conciliação', icon: Scale },
      { href: '/fechamento', label: 'Fechamento', icon: BookCheck },
    ],
  },
];

const allSections = [visaoGeral, ...condoGroups.flatMap((g) => g.items)];

/** Lê `/painel/c/<id>/<seção>/...` → id do condomínio e a seção em uso. */
export function parsePainelPath(pathname: string): {
  condoId: string | null;
  section: CondoSection | null;
  /** Sufixo da seção, para manter a mesma tela ao trocar de condomínio. */
  suffix: string;
} {
  const match = /^\/painel\/c\/([^/]+)(\/[^/]+)?/.exec(pathname);
  if (!match?.[1]) return { condoId: null, section: null, suffix: '' };
  const suffix = match[2] ?? '';
  return {
    condoId: match[1],
    section: allSections.find((s) => s.href === suffix) ?? null,
    suffix,
  };
}

/** Nome da gestora sem o sufixo "(demo)" do seed; o selo "Demo" aparece à parte. */
export function gestoraLabel(nome: string): { nome: string; demo: boolean } {
  const demo = /\s*\(demo\)\s*$/i;
  return { nome: nome.replace(demo, ''), demo: demo.test(nome) };
}
