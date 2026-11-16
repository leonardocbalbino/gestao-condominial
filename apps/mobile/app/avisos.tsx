import type { AnnouncementDto } from '@condo/contracts';
import { Body, Card, OfflineNotice, Title } from '@/components';
import { Screen } from '@/screen';
import { useUnitResource } from '@/use-cached';

/** Avisos do condomínio. Os não lidos também aparecem na tela inicial com "Li e entendi". */
export default function Avisos() {
  const { data, offline, error, loading, reload } =
    useUnitResource<AnnouncementDto[]>('/announcements');
  return (
    <Screen back refreshing={loading} onRefresh={() => void reload()}>
      <Title>Avisos</Title>
      {offline && <OfflineNotice savedAt={offline} />}
      {error && <Body>{error}</Body>}
      {data?.length === 0 && <Body muted>Nenhum aviso por enquanto.</Body>}
      {data?.map((a) => (
        <Card key={a.id} {...(a.lido ? {} : { tone: 'warning' as const })}>
          <Title>{a.titulo}</Title>
          <Body>{a.corpo}</Body>
          <Body muted>{a.lido ? 'Lido' : 'Ainda não lido'}</Body>
        </Card>
      ))}
    </Screen>
  );
}
