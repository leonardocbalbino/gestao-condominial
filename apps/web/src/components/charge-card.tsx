import { formatBRL, formatDate, nomeDoMes, type MyChargeDto } from '@condo/contracts';
import { CircleCheck, Clock, FileText, QrCode, TriangleAlert } from 'lucide-react';
import { CopyButton } from './copy-button';
import { Badge, ButtonLink, buttonClass, Card } from './ui';

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function prazo(dias: number): string {
  if (dias <= 0) return 'Vence hoje';
  if (dias === 1) return 'Vence amanhã';
  return `Vence em ${plural(dias, 'dia', 'dias')}`;
}

const secondaryLink = buttonClass({ variant: 'secondary', fullWidth: true });

/**
 * A taxa como o morador vê: linguagem do dia a dia, valor já atualizado e o Pix em
 * destaque (pagar em até dois toques). Em atraso o cartão fica laranja com o valor
 * "para pagar hoje"; cor nunca é o único sinal (ícone + texto no chip).
 */
export function ChargeCard({ charge, unitId }: { charge: MyChargeDto; unitId: string }) {
  const aberta = charge.status !== 'paga' && charge.status !== 'cancelada';
  const atrasada = aberta && charge.atrasada;
  const mes = nomeDoMes(charge.competencia);

  return (
    <Card tone={atrasada ? 'attention' : aberta ? 'primary' : 'neutral'}>
      <div className="mb-3">
        {atrasada ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-attention px-3 py-1 text-sm font-bold text-on-attention">
            <TriangleAlert aria-hidden size={18} /> Taxa em atraso há{' '}
            {plural(charge.diasAtraso, 'dia', 'dias')}
          </span>
        ) : aberta ? (
          <Badge tone="info">
            <Clock aria-hidden size={16} className="mr-1 inline align-[-3px]" />
            {prazo(charge.diasParaVencer)}
          </Badge>
        ) : (
          <Badge tone="success">
            <CircleCheck aria-hidden size={16} className="mr-1 inline align-[-3px]" />
            Paga{charge.pagoEm ? ` em ${formatDate(charge.pagoEm)}` : ''}
          </Badge>
        )}
      </div>

      <h3 className={`text-lg font-semibold ${atrasada ? 'text-on-attention-surface' : ''}`}>
        {atrasada ? `Sua taxa de ${mes}, com multa e juros` : charge.titulo}
      </h3>
      <p
        className={`mt-1 text-4xl font-extrabold tracking-tight tabular-nums ${atrasada ? 'text-on-attention-surface' : ''}`}
      >
        {formatBRL(
          aberta
            ? charge.valorAtualizadoCentavos
            : (charge.valorPagoCentavos ?? charge.valorCentavos),
        )}
      </p>
      {atrasada ? (
        <p className="mt-1 text-on-attention-surface">
          <strong>Valor atualizado para pagar hoje.</strong> Original{' '}
          {formatBRL(charge.valorCentavos)}, venceu em {formatDate(charge.vencimento)}.
        </p>
      ) : (
        aberta && (
          <p className="mt-1 text-text-muted">Vencimento: {formatDate(charge.vencimento)}</p>
        )
      )}

      {aberta && (charge.pixCopiaCola || charge.boletoUrl) && (
        <div className="mt-5 flex flex-col gap-3">
          {charge.pixCopiaCola && (
            <ButtonLink
              href={`/morador/pagar/${charge.id}?u=${unitId}`}
              variant={atrasada ? 'attention' : 'primary'}
              fullWidth
              className="min-h-14 text-lg"
            >
              <QrCode aria-hidden /> {atrasada ? 'Pagar agora com Pix' : 'Pagar com Pix'}
            </ButtonLink>
          )}
          <div className="grid grid-cols-2 gap-3">
            {charge.pixCopiaCola && (
              <CopyButton value={charge.pixCopiaCola} label="Copiar código" fullWidth />
            )}
            {charge.boletoUrl && (
              <a href={charge.boletoUrl} target="_blank" rel="noreferrer" className={secondaryLink}>
                <FileText aria-hidden /> {atrasada ? '2ª via' : 'Ver boleto'}
              </a>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
