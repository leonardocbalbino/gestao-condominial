/**
 * Tokens de design compartilhados por web (Tailwind/CSS) e mobile (React Native).
 * Valores numéricos em px lógicos (RN usa direto; a web converte para rem em `toCssVariables`).
 */

export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
  full: 9999,
} as const;

/** Alvo de toque mínimo exigido pela especificação (≥ 48px). */
export const minTouchTarget = 48;

/**
 * Escala tipográfica. A base é 18px (maior que o padrão de 16px) por causa do público
 * com pouca familiaridade com tecnologia; o usuário ainda pode ampliar via `fontScale`.
 */
export const typography = {
  fontFamily: {
    sans: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    mono: 'ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace',
  },
  size: {
    sm: 16,
    md: 18,
    lg: 22,
    xl: 28,
    xxl: 34,
  },
  lineHeight: {
    tight: 1.25,
    normal: 1.5,
  },
  weight: {
    regular: '400',
    medium: '500',
    bold: '700',
  },
} as const;

/**
 * Escala do painel da equipe (ADR-0009): mais densa que a do morador. Em px, com a raiz
 * do painel em 16px; a web converte para rem, então "A+" continua ampliando tudo.
 */
export const panelTypography = {
  page: { size: 28, weight: '700' },
  card: { size: 18, weight: '600' },
  body: { size: 15, weight: '400' },
  label: { size: 14, weight: '600' },
  caption: { size: 13, weight: '500' },
} as const;

/** Alturas de controle do painel (ADR-0009). O morador mantém ≥ 48px. */
export const panelControl = { sm: 36, md: 44 } as const;

export interface ColorPalette {
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  /** Borda de controles (campos, botões contornados): ≥ 3:1 sobre a superfície (WCAG 1.4.11). */
  border: string;
  /** Contorno de cartões e divisórias: decorativo, o próprio conteúdo delimita o cartão. */
  divider: string;
  primary: string;
  onPrimary: string;
  primaryHover: string;
  /** Texto/realce informativo (chip "Em revisão"). */
  info: string;
  /** Fundo suave da cor principal (chip "Vence em", item ativo do menu). */
  primarySoft: string;
  onPrimarySoft: string;
  success: string;
  successSurface: string;
  onSuccessSurface: string;
  warning: string;
  /** Atraso / atenção: laranja, não vermelho, para não assustar o morador. */
  attention: string;
  onAttention: string;
  attentionSurface: string;
  onAttentionSurface: string;
  danger: string;
  onDanger: string;
  /** Menu lateral do painel da gestora. */
  sidebar: string;
  onSidebar: string;
  /** Itens inativos do menu lateral. */
  onSidebarMuted: string;
  sidebarActive: string;
  /** Anel de foco (:focus-visible) sobre fundos claros. */
  focus: string;
  /** Anel de foco sobre o menu lateral escuro. */
  focusOnDark: string;
}

export const lightColors: ColorPalette = {
  background: '#F4F6F9',
  surface: '#FFFFFF',
  text: '#0F172A',
  textMuted: '#475569',
  border: '#64748B',
  divider: '#E2E8F0',
  primary: '#1D4ED8',
  onPrimary: '#FFFFFF',
  primaryHover: '#1E40AF',
  info: '#1E3A8A',
  primarySoft: '#DBEAFE',
  onPrimarySoft: '#1E3A8A',
  success: '#15803D',
  successSurface: '#ECFDF5',
  onSuccessSurface: '#065F46',
  warning: '#92400E',
  attention: '#C2410C',
  onAttention: '#FFFFFF',
  attentionSurface: '#FFF7ED',
  onAttentionSurface: '#7C2D12',
  danger: '#B91C1C',
  onDanger: '#FFFFFF',
  sidebar: '#0F172A',
  onSidebar: '#F8FAFC',
  onSidebarMuted: '#CBD5E1',
  sidebarActive: '#1E293B',
  focus: '#1D4ED8',
  focusOnDark: '#60A5FA',
};

export const highContrastColors: ColorPalette = {
  background: '#000000',
  surface: '#000000',
  text: '#FFFFFF',
  textMuted: '#FFFFFF',
  border: '#FFFFFF',
  divider: '#FFFFFF',
  primary: '#FFD400',
  onPrimary: '#000000',
  primaryHover: '#FFE14D',
  info: '#9CC9FF',
  primarySoft: '#000000',
  onPrimarySoft: '#FFD400',
  success: '#5CFF7A',
  successSurface: '#000000',
  onSuccessSurface: '#5CFF7A',
  warning: '#FFD400',
  attention: '#FFA94D',
  onAttention: '#000000',
  attentionSurface: '#000000',
  onAttentionSurface: '#FFA94D',
  danger: '#FF6B6B',
  onDanger: '#000000',
  sidebar: '#000000',
  onSidebar: '#FFFFFF',
  onSidebarMuted: '#FFFFFF',
  sidebarActive: '#333333',
  focus: '#00E5FF',
  focusOnDark: '#00E5FF',
};
