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
}: {
  label: string;
  icon: IconName;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}) {
  const { theme } = useTheme();
  const primary = variant === 'primary';
  const fg = primary ? theme.colors.onPrimary : theme.colors.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: theme.minTouchTarget,
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: theme.radius.md,
        backgroundColor: primary ? theme.colors.primary : theme.colors.surface,
        borderWidth: primary ? 0 : 2,
        borderColor: theme.colors.border,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        opacity: pressed || disabled ? 0.7 : 1,
      })}
    >
      <Ionicons name={icon} size={24} color={fg} />
      <Text style={{ color: fg, fontSize: theme.fontSize.md, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

export function Card({ children, tone }: { children: ReactNode; tone?: 'danger' | 'warning' }) {
  const { theme } = useTheme();
  const style: ViewStyle = {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: 16,
    gap: 8,
    borderWidth: tone === 'danger' ? 4 : tone === 'warning' ? 2 : 1,
    borderColor:
      tone === 'danger'
        ? theme.colors.danger
        : tone === 'warning'
          ? theme.colors.warning
          : theme.colors.border,
  };
  return <View style={style}>{children}</View>;
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
        minHeight: 110,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        borderRadius: theme.radius.lg,
        borderWidth: 2,
        borderColor: theme.colors.border,
        backgroundColor: theme.colors.surface,
      }}
    >
      <Ionicons name={icon} size={40} color={theme.colors.primary} />
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
