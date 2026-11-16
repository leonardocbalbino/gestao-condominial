import { router } from 'expo-router';
import { Body, Button, Card, Title } from '@/components';
import { useSession } from '@/lib/session';
import { Screen } from '@/screen';
import { useTheme } from '@/theme';

const SCALES = [1, 1.25, 1.5];

/** "Mais": tamanho da letra, alto contraste e sair. Novos módulos aparecem aqui. */
export default function Mais() {
  const { prefs, setPrefs } = useTheme();
  const { signOut } = useSession();
  const i = SCALES.indexOf(prefs.fontScale);

  return (
    <Screen back>
      <Title>Mais</Title>
      <Card>
        <Body>Tamanho da letra</Body>
        <Button
          label="Letra maior"
          icon="add-circle"
          disabled={i >= SCALES.length - 1}
          onPress={() => setPrefs({ ...prefs, fontScale: SCALES[i + 1] ?? prefs.fontScale })}
        />
        <Button
          label="Letra menor"
          icon="remove-circle"
          variant="secondary"
          disabled={i <= 0}
          onPress={() => setPrefs({ ...prefs, fontScale: SCALES[i - 1] ?? prefs.fontScale })}
        />
      </Card>
      <Card>
        <Button
          label={prefs.highContrast ? 'Cores normais' : 'Alto contraste'}
          icon="contrast"
          variant="secondary"
          onPress={() => setPrefs({ ...prefs, highContrast: !prefs.highContrast })}
        />
      </Card>
      <Button
        label="Sair"
        icon="log-out"
        variant="secondary"
        onPress={() =>
          void signOut().then(() => {
            router.replace('/entrar');
          })
        }
      />
    </Screen>
  );
}
