import { formatBRL, formatDate, nomeDoMes, type MyChargeDto } from '@condo/contracts';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { AccessibilityInfo, Linking, Text } from 'react-native';
import { Button, Card, Chip } from './components';
import { useTheme } from './theme';

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

function prazo(dias: number): string {
  if (dias <= 0) return 'Vence hoje';
  if (dias === 1) return 'Vence amanhã';
  return `Vence em ${plural(dias, 'dia', 'dias')}`;
}

/**
 * A taxa como o morador vê (layout aprovado). Pagar em até dois toques: "Pagar com Pix"
 * já copia o código, e a pessoa só cola no app do banco. Em atraso o cartão fica
 * laranja e mostra o valor atualizado "para pagar hoje".
 */
export function ChargeCard({ charge }: { charge: MyChargeDto }) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const [copied, setCopied] = useState(false);
  const aberta = charge.status !== 'paga' && charge.status !== 'cancelada';
  const atrasada = aberta && charge.atrasada;
  const ink = atrasada ? colors.onAttentionSurface : colors.text;
  const muted = atrasada ? colors.onAttentionSurface : colors.textMuted;

  const copy = async () => {
    if (!charge.pixCopiaCola) return;
    await Clipboard.setStringAsync(charge.pixCopiaCola);
    setCopied(true);
    AccessibilityInfo.announceForAccessibility(
      'Código Pix copiado. Cole no aplicativo do seu banco.',
    );
  };

  return (
    <Card tone={atrasada ? 'attention' : aberta ? 'primary' : 'neutral'}>
      {atrasada ? (
        <Chip
          tone="attention"
          icon="warning"
          label={`Taxa em atraso há ${plural(charge.diasAtraso, 'dia', 'dias')}`}
        />
      ) : aberta ? (
        <Chip icon="time" label={prazo(charge.diasParaVencer)} />
      ) : (
        <Chip
          tone="success"
          icon="checkmark-circle"
          label={charge.pagoEm ? `Paga em ${formatDate(charge.pagoEm)}` : 'Paga'}
        />
      )}
      <Text style={{ color: ink, fontSize: theme.fontSize.md, fontWeight: '600' }}>
        {atrasada
          ? `Sua taxa de ${nomeDoMes(charge.competencia)}, com multa e juros`
          : charge.titulo}
      </Text>
      <Text
        style={{ color: ink, fontSize: Math.round(theme.fontSize.xxl * 1.06), fontWeight: '800' }}
      >
        {formatBRL(
          aberta
            ? charge.valorAtualizadoCentavos
            : (charge.valorPagoCentavos ?? charge.valorCentavos),
        )}
      </Text>
      {aberta && (
        <Text style={{ color: muted, fontSize: theme.fontSize.sm }}>
          {atrasada
            ? `Valor atualizado para pagar hoje. Original ${formatBRL(charge.valorCentavos)}, venceu em ${formatDate(charge.vencimento)}.`
            : `Vencimento: ${formatDate(charge.vencimento)}`}
        </Text>
      )}
      {aberta && charge.pixCopiaCola && (
        <Button
          large
          variant={atrasada ? 'attention' : 'primary'}
          label={
            copied
              ? 'Copiado! Cole no seu banco'
              : atrasada
                ? 'Pagar agora com Pix'
                : 'Pagar com Pix'
          }
          icon={copied ? 'checkmark-circle' : 'qr-code'}
          onPress={() => void copy()}
        />
      )}
      {aberta && charge.boletoUrl && (
        <Button
          label={atrasada ? '2ª via do boleto' : 'Ver boleto'}
          icon="document-text"
          variant="secondary"
          onPress={() => void Linking.openURL(charge.boletoUrl ?? '')}
        />
      )}
    </Card>
  );
}
