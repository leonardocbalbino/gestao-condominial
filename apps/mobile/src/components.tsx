import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps, ReactNode } from 'react';
import { Pressable, Text, View, type ViewStyle } from 'react-native';
import { useTheme } from './theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * Componentes do app. Regras do §7: alvo de toque ≥ 48, sempre ícone + texto, rótulos
 * para VoiceOver/TalkBack, fonte do tema (ajustável).
 */

export function Title({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={{
        color: theme.colors.text,
        fontSize: theme.fontSize.xl,
        fontWeight: '700',
        marginBottom: 8,
      }}
    >
      {children}
    </Text>
  );
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  const { theme } = useTheme();
  return (
    <Text
      style={{
        color: muted ? theme.colors.textMuted : theme.colors.text,
        fontSize: theme.fontSize.md,
        lineHeight: theme.fontSize.md * 1.5,
      }}
    >
      {children}
    </Text>
  );
}

export function Button({
  label,
  icon,
  onPress,
  variant = 'primary',
  disabled,
  large,
}: {
  label: string;
  icon: IconName;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'attention';
  disabled?: boolean;
  /** Botão de destaque (pagar): 56 de altura, letra maior. */
  large?: boolean;
}) {
  const { theme } = useTheme();
  const filled = variant !== 'secondary';
  const bg =
    variant === 'attention'
      ? theme.colors.attention
      : filled
        ? theme.colors.primary
        : theme.colors.surface;
  const fg =
    variant === 'attention'
      ? theme.colors.onAttention
      : filled
        ? theme.colors.onPrimary
        : theme.colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        flexGrow: 1,
        minHeight: large ? 56 : 52,
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 14,
        backgroundColor: bg,
        borderWidth: filled ? 0 : 2,
        borderColor: theme.colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        opacity: pressed || disabled ? 0.7 : 1,
      })}
    >
      <Ionicons name={icon} size={24} color={fg} />
      <Text
        style={{
          color: fg,
          fontSize: large ? theme.fontSize.lg : theme.fontSize.md,
          fontWeight: '700',
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

type CardTone = 'neutral' | 'primary' | 'attention' | 'warning' | 'danger';

export function Card({ children, tone = 'neutral' }: { children: ReactNode; tone?: CardTone }) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const border: Record<CardTone, [number, string]> = {
    neutral: [1, colors.divider],
    primary: [2, colors.primary],
    attention: [2, colors.attention],
    warning: [2, colors.warning],
    danger: [4, colors.danger],
  };
  const style: ViewStyle = {
    backgroundColor: tone === 'attention' ? colors.attentionSurface : colors.surface,
    borderRadius: 18,
    padding: 18,
    gap: 8,
    borderWidth: border[tone][0],
    borderColor: border[tone][1],
  };
  return <View style={style}>{children}</View>;
}

/** Selo curto (ex.: "Vence em 3 dias"), sempre com ícone + texto. */
export function Chip({
  label,
  icon,
  tone = 'info',
}: {
  label: string;
  icon: IconName;
  tone?: 'info' | 'attention' | 'success';
}) {
  const { theme } = useTheme();
  const colors = theme.colors;
  const [bg, fg] =
    tone === 'attention'
      ? [colors.attention, colors.onAttention]
      : tone === 'success'
        ? [colors.successSurface, colors.onSuccessSurface]
        : [colors.primarySoft, colors.onPrimarySoft];
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: bg,
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 4,
      }}
    >
      <Ionicons name={icon} size={16} color={fg} />
      <Text style={{ color: fg, fontSize: theme.fontSize.sm, fontWeight: '700' }}>{label}</Text>
    </View>
  );
}

/** Atalho grande da tela inicial (ícone + uma palavra; dois por linha). */
export function Shortcut({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: IconName;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        flexBasis: '47%',
        flexGrow: 1,
        minHeight: 104,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: theme.colors.divider,
        backgroundColor: theme.colors.surface,
      }}
    >
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.primarySoft,
        }}
      >
        <Ionicons name={icon} size={26} color={theme.colors.onPrimarySoft} />
      </View>
      <Text style={{ color: theme.colors.text, fontSize: theme.fontSize.lg, fontWeight: '700' }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function OfflineNotice({ savedAt }: { savedAt: string }) {
  const { theme } = useTheme();
  return (
    <View
      accessibilityRole="alert"
      style={{
        borderWidth: 2,
        borderColor: theme.colors.warning,
        borderRadius: theme.radius.md,
        padding: 12,
      }}
    >
      <Text style={{ color: theme.colors.warning, fontSize: theme.fontSize.sm, fontWeight: '700' }}>
        Sem conexão. Mostrando o que foi salvo em {new Date(savedAt).toLocaleString('pt-BR')}.
      </Text>
    </View>
  );
}
