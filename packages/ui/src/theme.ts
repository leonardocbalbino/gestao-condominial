import { contrastRatio, parseHex, toHex, WCAG_AA_TEXT } from './contrast';
import {
  highContrastColors,
  lightColors,
  minTouchTarget,
  radius,
  spacing,
  typography,
  type ColorPalette,
} from './tokens';

/** Personalização visual de uma gestora (white label). */
export interface ThemeBranding {
  primaryColor?: string;
  logoUrl?: string;
}

export interface ThemeOptions {
  branding?: ThemeBranding;
  highContrast?: boolean;
  /** Ampliação de fonte escolhida pelo usuário (1 = padrão). Limitada a [1, 2]. */
  fontScale?: number;
}

export interface Theme {
  colors: ColorPalette;
  spacing: typeof spacing;
  radius: typeof radius;
  minTouchTarget: number;
  fontFamily: typeof typography.fontFamily;
  fontSize: Record<keyof typeof typography.size, number>;
  lineHeight: typeof typography.lineHeight;
  fontWeight: typeof typography.weight;
  logoUrl: string | undefined;
}

const WHITE = '#FFFFFF';
const BLACK = '#000000';

/**
 * Escolhe a cor de texto sobre `primary` e, se nem branco nem preto atingirem AA,
 * escurece a cor da marca até atingir. A marca da gestora nunca derruba a acessibilidade.
 */
export function accessiblePrimary(primary: string): { primary: string; onPrimary: string } {
  let current = primary.toUpperCase();
  for (let step = 0; step < 20; step++) {
    const onWhite = contrastRatio(current, WHITE);
    const onBlack = contrastRatio(current, BLACK);
    if (onWhite >= WCAG_AA_TEXT) return { primary: current, onPrimary: WHITE };
    if (onBlack >= WCAG_AA_TEXT) return { primary: current, onPrimary: BLACK };
    const [r, g, b] = parseHex(current);
    current = toHex([r * 0.9, g * 0.9, b * 0.9]);
  }
  return { primary: current, onPrimary: WHITE };
}

/** Cor do hover do botão principal: um pouco mais escura (ou mais clara, se o texto é preto). */
export function hoverTone(primary: string, onPrimary: string): string {
  const [r, g, b] = parseHex(primary);
  return onPrimary === WHITE
    ? toHex([r * 0.82, g * 0.82, b * 0.82])
    : toHex([r + (255 - r) * 0.3, g + (255 - g) * 0.3, b + (255 - b) * 0.3]);
}

/**
 * Tons suaves derivados da cor da marca: fundo = 85% branco + 15% marca; texto sobre ele
 * = a marca escurecida até atingir AA. Assim o chip e o menu ativo acompanham o white label.
 */
export function softTones(primary: string): { primarySoft: string; onPrimarySoft: string } {
  const [r, g, b] = parseHex(primary);
  const mix = (c: number) => c * 0.15 + 255 * 0.85;
  const primarySoft = toHex([mix(r), mix(g), mix(b)]);
  let on = primary.toUpperCase();
  for (let step = 0; step < 30 && contrastRatio(on, primarySoft) < WCAG_AA_TEXT; step++) {
    const [cr, cg, cb] = parseHex(on);
    on = toHex([cr * 0.85, cg * 0.85, cb * 0.85]);
  }
  return { primarySoft, onPrimarySoft: on };
}

export function createTheme(options: ThemeOptions = {}): Theme {
  const fontScale = Math.min(2, Math.max(1, options.fontScale ?? 1));
  let colors: ColorPalette = options.highContrast ? highContrastColors : lightColors;

  // No alto contraste a marca é ignorada: a legibilidade tem prioridade sobre o branding.
  if (!options.highContrast && options.branding?.primaryColor) {
    const brand = accessiblePrimary(options.branding.primaryColor);
    colors = {
      ...colors,
      ...brand,
      primaryHover: hoverTone(brand.primary, brand.onPrimary),
      ...softTones(brand.primary),
    };
  }

  const fontSize = Object.fromEntries(
    Object.entries(typography.size).map(([k, v]) => [k, Math.round(v * fontScale)]),
  ) as Theme['fontSize'];

  return {
    colors,
    spacing,
    radius,
    minTouchTarget,
    fontFamily: typography.fontFamily,
    fontSize,
    lineHeight: typography.lineHeight,
    fontWeight: typography.weight,
    logoUrl: options.branding?.logoUrl,
  };
}

const kebab = (s: string): string => s.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);

/**
 * Converte o tema em variáveis CSS (`--color-primary`, `--font-size-md`...) para a web.
 * O Tailwind do app web referencia essas variáveis, então trocar o tema não exige rebuild.
 */
export function toCssVariables(theme: Theme): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [k, v] of Object.entries(theme.colors)) vars[`--color-${kebab(k)}`] = v;
  for (const [k, v] of Object.entries(theme.fontSize)) vars[`--font-size-${k}`] = `${v / 16}rem`;
  for (const [k, v] of Object.entries(theme.spacing)) vars[`--space-${k}`] = `${v / 16}rem`;
  for (const [k, v] of Object.entries(theme.radius)) vars[`--radius-${k}`] = `${v}px`;
  vars['--touch-target-min'] = `${theme.minTouchTarget}px`;
  return vars;
}
