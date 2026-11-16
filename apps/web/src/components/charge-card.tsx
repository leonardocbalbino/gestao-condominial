import { formatBRL, formatDate, type MyChargeDto } from '@condo/contracts';
import { FileText, QrCode, TriangleAlert } from 'lucide-react';
import { CopyButton } from './copy-button';
import { ButtonLink, Card } from './ui';

/**
 * A taxa como o morador vê: título simples, valor já atualizado e os botões para pagar.
 * Em atraso, destaque forte (borda grossa vermelha + ícone + texto).
 */
export function ChargeCard({ charge, unitId }: { charge: MyChargeDto; unitId: string }) {
  const aberta = charge.status !== 'paga' && charge.status !== 'cancelada';
  return (
    <Card tone={charge.atrasada ? 'danger' : undefined}>
      <h3 className="text-xl font-bold">{charge.titulo}</h3>
      {charge.atrasada && (
        <p className="mt-1 flex items-center gap-2 font-bold text-danger">
          <TriangleAlert aria-hidden /> Em atraso há {charge.diasAtraso}{' '}
          {charge.diasAtraso === 1 ? 'dia' : 'dias'}
        </p>
      )}
      <p className="mt-2 text-3xl font-bold tabular-nums">
        {formatBRL(
          aberta
            ? charge.valorAtualizadoCentavos
            : (charge.valorPagoCentavos ?? charge.valorCentavos),
        )}
      </p>
      <p className="text-text-muted">
        {charge.status === 'paga' && charge.pagoEm
          ? `Paga em ${formatDate(charge.pagoEm)}`
          : `Vence em ${formatDate(charge.vencimento)}`}
        {charge.atrasada && ` · valor original ${formatBRL(charge.valorCentavos)}`}
      </p>
      {aberta && (charge.pixCopiaCola || charge.boletoUrl) && (
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {charge.pixCopiaCola && (
            <ButtonLink href={`/morador/pagar/${charge.id}?u=${unitId}`}>
              <QrCode aria-hidden /> Pagar com Pix
            </ButtonLink>
          )}
          {charge.pixCopiaCola && <CopyButton value={charge.pixCopiaCola} label="Copiar código" />}
          {charge.boletoUrl && (
            <a
              href={charge.boletoUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-lg border-2 border-border bg-surface px-5 py-3 font-semibold"
            >
              <FileText aria-hidden /> 2ª via
            </a>
          )}
        </div>
      )}
    </Card>
  );
}
