import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SessionProvider, useSession } from '@/lib/session';
import { ThemeProvider } from '@/theme';

/** O tema usa a cor da gestora da unidade em uso (white label). */
function Themed({ children }: { children: ReactNode }) {
  const { unit } = useSession();
  return (
    <ThemeProvider {...(unit?.primaryColor ? { primaryColor: unit.primaryColor } : {})}>
      {children}
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <Themed>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false }} />
        </Themed>
      </SessionProvider>
    </SafeAreaProvider>
  );
}
