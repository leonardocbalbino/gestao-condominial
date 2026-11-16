import { Body, Card, Title } from '@/components';
import { useSession } from '@/lib/session';
import { Screen } from '@/screen';

/** Destino do botão fixo "Falar com a gestora". */
export default function Ajuda() {
  const { unit } = useSession();
  return (
    <Screen back>
      <Title>Falar com a gestora</Title>
      <Card>
        <Body>Quem cuida do seu condomínio é a {unit?.gestoraNome ?? 'administradora'}.</Body>
        <Body muted>
          Use o telefone ou e-mail que a administradora informou no último aviso. O atendimento por
          mensagens dentro do aplicativo chega em breve.
        </Body>
      </Card>
    </Screen>
  );
}
