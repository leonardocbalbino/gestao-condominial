import { Redirect } from 'expo-router';
import { useState } from 'react';
import { TextInput } from 'react-native';
import { Body, Button, Card, Title } from '@/components';
import { api, useSession } from '@/lib/session';
import { Screen } from '@/screen';
import { useTheme } from '@/theme';

/** Entrar sem senha: link mágico no e-mail; com sessão guardada, digital/rosto. */
export default function Entrar() {
  const { status, unit, unlock } = useSession();
  const { theme } = useTheme();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  if (status === 'signed-in' && unit) return <Redirect href="/inicio" />;

  const send = async () => {
    setSending(true);
    try {
      await api.request('/auth/magic-link', { method: 'POST', anonymous: true, body: { email } });
      setMessage('Pronto! Abra o e-mail neste celular e toque no link. Ele vale por 15 minutos.');
    } catch {
      setMessage('Não conseguimos enviar agora. Confira o e-mail e a internet e tente de novo.');
    } finally {
      setSending(false);
    }
  };

  return (
    <Screen>
      <Title>Meu Condomínio</Title>
      {status === 'locked' && (
        <Card>
          <Body>Entre com a sua digital ou o reconhecimento de rosto.</Body>
          <Button label="Entrar com digital" icon="finger-print" onPress={() => void unlock()} />
        </Card>
      )}
      <Card>
        <Body>Digite seu e-mail. Enviamos um link para você entrar, sem senha.</Body>
        <TextInput
          accessibilityLabel="Seu e-mail"
          placeholder="seu@email.com"
          autoCapitalize="none"
          autoComplete="email"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          style={{
            minHeight: theme.minTouchTarget,
            borderWidth: 2,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.md,
            paddingHorizontal: 12,
            fontSize: theme.fontSize.md,
            color: theme.colors.text,
            backgroundColor: theme.colors.surface,
          }}
        />
        <Button
          label="Receber link no e-mail"
          icon="mail"
          onPress={() => void send()}
          disabled={sending || !email}
        />
        {message && <Body>{message}</Body>}
      </Card>
    </Screen>
  );
}
