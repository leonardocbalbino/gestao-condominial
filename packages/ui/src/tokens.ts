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

export interface ColorPalette {
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  border: string;
  primary: string;
  onPrimary: string;
  success: string;
  warning: string;
  danger: string;
  onDanger: string;
  focus: string;
}

export const lightColors: ColorPalette = {
  background: '#F7F8FA',
  surface: '#FFFFFF',
  text: '#14171F',
  textMuted: '#4A5160',
  border: '#C9CED8',
  primary: '#1D4ED8',
  onPrimary: '#FFFFFF',
  success: '#166534',
  warning: '#92400E',
  danger: '#B91C1C',
  onDanger: '#FFFFFF',
  focus: '#F59E0B',
};

export const highContrastColors: ColorPalette = {
  background: '#000000',
  surface: '#000000',
  text: '#FFFFFF',
  textMuted: '#FFFFFF',
  border: '#FFFFFF',
  primary: '#FFD400',
  onPrimary: '#000000',
  success: '#5CFF7A',
  warning: '#FFD400',
  danger: '#FF6B6B',
  onDanger: '#000000',
  focus: '#00E5FF',
};
