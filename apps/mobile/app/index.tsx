import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';
import { useSession } from '@/lib/session';

/** Porta de entrada: decide entre carregar, desbloquear, entrar ou a tela inicial. */
export default function Index() {
  const { status, unit } = useSession();
  if (status === 'loading') {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator size="large" accessibilityLabel="Carregando" />
      </View>
    );
  }
  if (status === 'signed-in' && unit) return <Redirect href="/inicio" />;
  return <Redirect href="/entrar" />;
}
