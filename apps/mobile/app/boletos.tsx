import type { MyChargeDto } from '@condo/contracts';
import { Body, OfflineNotice, Title } from '@/components';
import { ChargeCard } from '@/charge-card';
import { Screen } from '@/screen';
import { useUnitResource } from '@/use-cached';

/** Todas as taxas da unidade (o extrato), mais recentes primeiro. Funciona offline. */
export default function Boletos() {
  const { data, offline, error, loading, reload } = useUnitResource<MyChargeDto[]>('/charges');
  return (
    <Screen back refreshing={loading} onRefresh={() => void reload()}>
      <Title>Boletos</Title>
      {offline && <OfflineNotice savedAt={offline} />}
      {error && <Body>{error}</Body>}
      {data?.length === 0 && <Body muted>Nenhuma taxa emitida ainda.</Body>}
      {data?.map((c) => (
        <ChargeCard key={c.id} charge={c} />
      ))}
    </Screen>
  );
}
