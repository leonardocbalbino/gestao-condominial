import type { MoradorHomeDto } from '@condo/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Body, Button, Card, OfflineNotice, Shortcut, Title } from '@/components';
import { ChargeCard } from '@/charge-card';
import { api, useSession } from '@/lib/session';
import { Screen } from '@/screen';
import { useUnitResource } from '@/use-cached';

/** Tela inicial na ordem do §7: pendência → avisos não lidos → avisos do dia → atalhos. */
export default function Inicio() {
  const { unit } = useSession();
  const { data: home, offline, error, loading, reload } = useUnitResource<MoradorHomeDto>('/home');
  const [confirming, setConfirming] = useState<string | null>(null);

  const markRead = async (id: string) => {
    if (!unit) return;
    setConfirming(id);
    try {
      await api.request(
        `/condominios/${unit.condominioId}/units/${unit.unitId}/announcements/${id}/read`,
        { method: 'POST', gestoraId: unit.gestoraId },
      );
      await reload();
    } finally {
      setConfirming(null);
    }
  };

  return (
    <Screen refreshing={loading} onRefresh={() => void reload()}>
      {home && (
        <View>
          <Title>{home.condominioNome}</Title>
          <Body muted>Unidade {home.unidade}</Body>
        </View>
      )}
      {offline && <OfflineNotice savedAt={offline} />}
      {error && <Body>{error}</Body>}

      {home?.pendencia && <ChargeCard charge={home.pendencia} />}

      {home?.comunicadosNaoLidos.map((a) => (
        <Card key={a.id} tone="warning">
          <Title>{a.titulo}</Title>
          <Body>{a.corpo}</Body>
          <Button
            label="Li e entendi"
            icon="checkmark-done"
            disabled={confirming === a.id || Boolean(offline)}
            onPress={() => void markRead(a.id)}
          />
        </Card>
      ))}

      {home && home.avisosDoDia.length > 0 && (
        <Card>
          <Title>Hoje</Title>
          {home.avisosDoDia.map((a) => (
            <Body key={a.texto}>{a.texto}</Body>
          ))}
        </Card>
      )}

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        <Shortcut label="Boletos" icon="cash" onPress={() => router.push('/boletos')} />
        <Shortcut label="Avisos" icon="megaphone" onPress={() => router.push('/avisos')} />
        <Shortcut label="Mais" icon="grid" onPress={() => router.push('/mais')} />
      </View>
    </Screen>
  );
}
