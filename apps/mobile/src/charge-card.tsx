import { formatBRL, formatDate, type MyChargeDto } from '@condo/contracts';
import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { AccessibilityInfo, Linking, Text } from 'react-native';
import { Body, Button, Card } from './components';
import { useTheme } from './theme';

/**
 * A taxa como o morador vê. Pagar em até dois toques: "Copiar código Pix" já copia,
 * e a pessoa só cola no app do banco. Em atraso, borda grossa vermelha + texto.
 */
export function ChargeCard({ charge }: { charge: MyChargeDto }) {
  const { theme } = useTheme();
  const [copied, setCopied] = useState(false);
  const aberta = charge.status !== 'paga' && charge.status !== 'cancelada';

  const copy = async () => {
    if (!charge.pixCopiaCola) return;
    await Clipboard.setStringAsync(charge.pixCopiaCola);
    setCopied(true);
    AccessibilityInfo.announceForAccessibility(
      'Código Pix copiado. Cole no aplicativo do seu banco.',
    );
  };

  return (
    <Card {...(charge.atrasada ? { tone: 'danger' as const } : {})}>
      <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.lg, fontWeight: '700' }}>
        {charge.titulo}
      </Text>
      {charge.atrasada && (
        <Text
          style={{ color: theme.colors.danger, fontSize: theme.fontSize.md, fontWeight: '700' }}
        >
          Em atraso há {charge.diasAtraso} {charge.diasAtraso === 1 ? 'dia' : 'dias'}
        </Text>
      )}
      <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.xxl, fontWeight: '700' }}>
        {formatBRL(
          aberta
            ? charge.valorAtualizadoCentavos
            : (charge.valorPagoCentavos ?? charge.valorCentavos),
        )}
      </Text>
      <Body muted>
        {charge.status === 'paga' && charge.pagoEm
          ? `Paga em ${formatDate(charge.pagoEm)}`
          : `Vence em ${formatDate(charge.vencimento)}`}
      </Body>
      {aberta && charge.pixCopiaCola && (
        <Button
          label={copied ? 'Copiado! Cole no seu banco' : 'Pagar com Pix: copiar código'}
          icon={copied ? 'checkmark-circle' : 'copy'}
          onPress={() => void copy()}
        />
      )}
      {aberta && charge.boletoUrl && (
        <Button
          label="2ª via do boleto"
          icon="document-text"
          variant="secondary"
          onPress={() => void Linking.openURL(charge.boletoUrl ?? '')}
        />
      )}
    </Card>
  );
}
