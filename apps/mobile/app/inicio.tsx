import { Ionicons } from '@expo/vector-icons';
import type { MoradorHomeDto } from '@condo/contracts';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Body, Button, Card, OfflineNotice, Shortcut } from '@/components';
import { ChargeCard } from '@/charge-card';
import { api, useSession } from '@/lib/session';
import { Screen } from '@/screen';
import { useTheme } from '@/theme';
import { useUnitResource } from '@/use-cached';

function SectionTitle({ children }: { children: string }) {
  const { theme } = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={{ color: theme.colors.text, fontSize: theme.fontSize.lg, fontWeight: '700' }}
    >
      {children}
    </Text>
  );
}

/**
 * Tela inicial na ordem do §7 (layout aprovado): saudação → pendência → comunicados não
 * lidos → avisos do dia → atalhos. Só aparecem atalhos de módulos que já existem.
 */
export default function Inicio() {
  const { theme } = useTheme();
  const colors = theme.colors;
  const { unit } = useSession();
  const { data: home, offline, error, loading, reload } = useUnitResource<MoradorHomeDto>('/home');
  const [confirming, setConfirming] = useState<string | null>(null);
  const naoLidos = home?.comunicadosNaoLidos.length ?? 0;

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
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text
              accessibilityRole="header"
              style={{ color: colors.text, fontSize: theme.fontSize.xl, fontWeight: '800' }}
            >
              {home.primeiroNome ? `Olá, ${home.primeiroNome}` : 'Olá!'}
            </Text>
            <Body muted>
              {home.condominioNome} · {home.unidade}
            </Body>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={naoLidos > 0 ? `Avisos, ${naoLidos} não lidos` : 'Avisos'}
            onPress={() => router.push('/avisos')}
            style={{
              width: 48,
              height: 48,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.divider,
              backgroundColor: colors.surface,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="notifications-outline" size={24} color={colors.text} />
            {naoLidos > 0 && (
              <View
                style={{
                  position: 'absolute',
                  top: 10,
                  right: 10,
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  borderWidth: 2,
                  borderColor: colors.surface,
                  backgroundColor: colors.attention,
                }}
              />
            )}
          </Pressable>
        </View>
      )}
      {offline && <OfflineNotice savedAt={offline} />}
      {error && <Body>{error}</Body>}

      {home?.pendencia && <ChargeCard charge={home.pendencia} />}

      {home?.comunicadosNaoLidos.map((a) => (
        <Card key={a.id}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View
              style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary }}
            />
            <Text style={{ color: colors.primary, fontSize: theme.fontSize.sm, fontWeight: '700' }}>
              Comunicado novo
            </Text>
          </View>
          <Text
            accessibilityRole="header"
            style={{ color: colors.text, fontSize: theme.fontSize.lg, fontWeight: '700' }}
          >
            {a.titulo}
          </Text>
          <Body muted>{a.corpo}</Body>
          <Button
            label="Li e entendi"
            icon="checkmark-done"
            variant="secondary"
            disabled={confirming === a.id || Boolean(offline)}
            onPress={() => void markRead(a.id)}
          />
        </Card>
      ))}

      {home && home.avisosDoDia.length > 0 && (
        <View style={{ gap: 8 }}>
          <SectionTitle>Hoje</SectionTitle>
          {home.avisosDoDia.map((a) => (
            <Card key={a.texto}>
              <Body>{a.texto}</Body>
            </Card>
          ))}
        </View>
      )}

      <View style={{ gap: 8 }}>
        <SectionTitle>Atalhos</SectionTitle>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
          <Shortcut label="Boletos" icon="cash" onPress={() => router.push('/boletos')} />
          <Shortcut label="Avisos" icon="megaphone" onPress={() => router.push('/avisos')} />
          <Shortcut label="Mais" icon="grid" onPress={() => router.push('/mais')} />
        </View>
      </View>
    </Screen>
  );
}
