import 'server-only';
import { createTheme, toCssVariables } from '@condo/ui';
import type { CSSProperties } from 'react';
import { readPreferences } from './session';

/**
 * Variáveis CSS do tema: cor da gestora (ajustada para contraste AA pelo @condo/ui),
 * alto contraste e escala de fonte escolhidos pela pessoa.
 */
export async function themeStyle(primaryColor?: string): Promise<CSSProperties> {
  const prefs = await readPreferences();
  const theme = createTheme({
    highContrast: prefs.highContrast,
    ...(primaryColor ? { branding: { primaryColor } } : {}),
  });
  return {
    ...toCssVariables(theme),
    '--font-scale': String(prefs.fontScale),
  } as CSSProperties;
}
