import { describe, expect, it } from 'vitest';
import { contrastRatio, WCAG_AA_TEXT } from './contrast';
import { highContrastColors, lightColors } from './tokens';
import { accessiblePrimary, createTheme, toCssVariables } from './theme';

describe('contrastRatio', () => {
  it('preto sobre branco é 21:1', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
  });
});

describe('paletas base', () => {
  const pairs = (c: typeof lightColors) => [
    [c.text, c.background],
    [c.text, c.surface],
    [c.textMuted, c.surface],
    [c.onPrimary, c.primary],
    [c.onDanger, c.danger],
    [c.onPrimarySoft, c.primarySoft],
    [c.onSuccessSurface, c.successSurface],
    [c.onAttentionSurface, c.attentionSurface],
    [c.attention, c.attentionSurface],
    [c.onAttention, c.attention],
    [c.attention, c.surface],
    [c.success, c.surface],
    [c.onSidebar, c.sidebar],
    [c.onSidebar, c.sidebarActive],
    [c.textMuted, c.background],
  ];

  it.each([
    ['clara', lightColors],
    ['alto contraste', highContrastColors],
  ])('paleta %s: borda de controle tem 3:1 sobre a superfície (WCAG 1.4.11)', (_name, palette) => {
    expect(contrastRatio(palette.border, palette.surface)).toBeGreaterThanOrEqual(3);
  });

  it.each([
    ['clara', lightColors],
    ['alto contraste', highContrastColors],
  ])('paleta %s atinge WCAG AA em todos os pares de texto', (_name, palette) => {
    for (const [fg, bg] of pairs(palette)) {
      expect(contrastRatio(fg as string, bg as string)).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
    }
  });
});

describe('accessiblePrimary (white label)', () => {
  it.each(['#FFEB3B', '#00BCD4', '#8BC34A', '#1D4ED8', '#E91E63', '#FFFFFF'])(
    'cor de marca %s sempre resulta em par AA',
    (brand) => {
      const { primary, onPrimary } = accessiblePrimary(brand);
      expect(contrastRatio(primary, onPrimary)).toBeGreaterThanOrEqual(WCAG_AA_TEXT);
    },
  );

  it.each(['#FFEB3B', '#00BCD4', '#7B1FA2', '#1D4ED8'])(
    'tons suaves da marca %s mantêm texto AA',
    (brand) => {
      const { colors } = createTheme({ branding: { primaryColor: brand } });
      expect(contrastRatio(colors.onPrimarySoft, colors.primarySoft)).toBeGreaterThanOrEqual(
        WCAG_AA_TEXT,
      );
    },
  );

  it('preserva a cor da marca quando ela já é acessível', () => {
    expect(accessiblePrimary('#1D4ED8')).toEqual({ primary: '#1D4ED8', onPrimary: '#FFFFFF' });
  });
});

describe('createTheme', () => {
  it('aplica a cor da gestora', () => {
    const theme = createTheme({ branding: { primaryColor: '#7B1FA2' } });
    expect(theme.colors.primary).toBe('#7B1FA2');
  });

  it('alto contraste ignora a cor da marca', () => {
    const theme = createTheme({ highContrast: true, branding: { primaryColor: '#7B1FA2' } });
    expect(theme.colors.primary).toBe(highContrastColors.primary);
  });

  it('amplia a fonte e limita a escala a 2x', () => {
    expect(createTheme({ fontScale: 1.5 }).fontSize.md).toBe(27);
    expect(createTheme({ fontScale: 5 }).fontSize.md).toBe(36);
    expect(createTheme({ fontScale: 0.5 }).fontSize.md).toBe(18);
  });

  it('alvo de toque mínimo é 48px', () => {
    expect(createTheme().minTouchTarget).toBe(48);
  });
});

describe('toCssVariables', () => {
  it('gera variáveis CSS com rem para fontes', () => {
    const vars = toCssVariables(createTheme());
    expect(vars['--color-on-primary']).toBe('#FFFFFF');
    expect(vars['--font-size-md']).toBe('1.125rem');
    expect(vars['--touch-target-min']).toBe('48px');
  });
});
