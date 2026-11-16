import { formatBRL, type MyChargeDto } from '@condo/contracts';
import Link from 'next/link';
import QRCode from 'qrcode';
import { CopyButton } from '@/components/copy-button';
import { Card, EmptyState } from '@/components/ui';
import { api } from '@/lib/api';
import { moradorContext, unitPath } from '@/lib/context';

/** Pagar com Pix: QR para ler com o app do banco e o código para copiar e colar. */
export default async function PagarPage({
  params,
  searchParams,
}: {
  params: Promise<{ chargeId: string }>;
  searchParams: Promise<{ u?: string }>;
}) {
  const { chargeId } = await params;
  const { unit } = await moradorContext((await searchParams).u);
  const charges = await api<MyChargeDto[]>(`${unitPath(unit)}/charges`, {
    gestoraId: unit.gestoraId,
  });
  const charge = charges.find((c) => c.id === chargeId);
  if (!charge?.pixCopiaCola) return <EmptyState>Este boleto não tem Pix disponível.</EmptyState>;
  const qr = await QRCode.toString(charge.pixCopiaCola, { type: 'svg', margin: 1 });

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/morador?u=${unit.unitId}`}
        className="touch inline-flex items-center text-primary underline"
      >
        ← Início
      </Link>
      <Card>
        <h1 className="text-2xl font-bold">{charge.titulo}</h1>
        <p className="mt-1 text-3xl font-bold tabular-nums">
          {formatBRL(charge.valorAtualizadoCentavos)}
        </p>
        <ol className="my-4 list-decimal pl-6 text-lg">
          <li>Abra o aplicativo do seu banco e escolha Pix.</li>
          <li>Leia o código abaixo ou toque em &quot;Copiar código&quot; e cole no banco.</li>
        </ol>
        <div
          className="mx-auto w-64 bg-white p-2"
          role="img"
          aria-label="QR code do Pix"
          dangerouslySetInnerHTML={{ __html: qr }}
        />
        <div className="mt-4 flex justify-center">
          <CopyButton value={charge.pixCopiaCola} label="Copiar código" />
        </div>
      </Card>
    </div>
  );
}
