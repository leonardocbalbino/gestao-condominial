import AsyncStorage from '@react-native-async-storage/async-storage';
import { createTheme, type Theme } from '@condo/ui';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

const PREFS_KEY = 'condo.prefs';

interface Prefs {
  fontScale: number;
  highContrast: boolean;
}

interface ThemeValue {
  theme: Theme;
  prefs: Prefs;
  setPrefs: (prefs: Prefs) => void;
}

const ThemeContext = createContext<ThemeValue | null>(null);

/**
 * Tema do @condo/ui: cor da gestora (ajustada para contraste AA), fonte ajustável e alto
 * contraste. A preferência fica guardada no aparelho.
 */
export function ThemeProvider({
  primaryColor,
  children,
}: {
  primaryColor?: string;
  children: ReactNode;
}) {
  const [prefs, setPrefsState] = useState<Prefs>({ fontScale: 1, highContrast: false });

  useEffect(() => {
    void AsyncStorage.getItem(PREFS_KEY).then((raw) => {
      if (raw) setPrefsState(JSON.parse(raw) as Prefs);
    });
  }, []);

  const value = useMemo<ThemeValue>(
    () => ({
      theme: createTheme({
        fontScale: prefs.fontScale,
        highContrast: prefs.highContrast,
        ...(primaryColor ? { branding: { primaryColor } } : {}),
      }),
      prefs,
      setPrefs(next) {
        setPrefsState(next);
        void AsyncStorage.setItem(PREFS_KEY, JSON.stringify(next));
      },
    }),
    [prefs, primaryColor],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error('useTheme fora do ThemeProvider');
  return value;
}
