import type { AuthStepResult } from '@condo/contracts';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { Body, Button, Card, Title } from '@/components';
import { api, useSession } from '@/lib/session';
import { Screen } from '@/screen';

/** Destino do link mágico no app (condominio://entrar/link?token=…). */
export default function LinkMagico() {
  const { token } = useLocalSearchParams<{ token?: string }>();
  const { complete } = useSession();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('Link incompleto. Peça um novo link.');
      return;
    }
    void (async () => {
      try {
        const result = await api.request<AuthStepResult>('/auth/magic-link/consume', {
          method: 'POST',
          anonymous: true,
          body: { token },
        });
        const problem = await complete(result);
        if (problem) setError(problem);
        else router.replace('/inicio');
      } catch {
        setError('Este link já foi usado ou expirou. Peça um novo.');
      }
    })();
  }, [token, complete]);

  return (
    <Screen>
      <Title>Entrando…</Title>
      {error ? (
        <Card>
          <Body>{error}</Body>
          <Button label="Voltar" icon="arrow-back" onPress={() => router.replace('/entrar')} />
        </Card>
      ) : (
        <ActivityIndicator size="large" accessibilityLabel="Entrando" />
      )}
    </Screen>
  );
}
