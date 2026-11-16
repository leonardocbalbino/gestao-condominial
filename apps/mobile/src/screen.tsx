import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTheme } from './theme';

/**
 * Moldura das telas: rolagem, puxar para atualizar, "voltar" opcional e o botão fixo
 * "Falar com a gestora" (§7).
 */
export function Screen({
  children,
  back,
  refreshing = false,
  onRefresh,
}: {
  children: ReactNode;
  back?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
}) {
  const { theme } = useTheme();
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 120 }}
        refreshControl={
          onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} /> : undefined
        }
      >
        {back && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Voltar"
            onPress={() => router.back()}
            style={{
              minHeight: theme.minTouchTarget,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <Ionicons name="arrow-back" size={24} color={theme.colors.primary} />
            <Text
              style={{
                color: theme.colors.primary,
                fontSize: theme.fontSize.md,
                fontWeight: '700',
              }}
            >
              Voltar
            </Text>
          </Pressable>
        )}
        {children}
      </ScrollView>
      <View style={{ position: 'absolute', right: 16, bottom: 24 }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Falar com a gestora"
          onPress={() => router.push('/ajuda')}
          style={{
            minHeight: 56,
            paddingHorizontal: 20,
            borderRadius: 28,
            backgroundColor: theme.colors.primary,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            elevation: 4,
          }}
        >
          <Ionicons name="chatbubble-ellipses" size={24} color={theme.colors.onPrimary} />
          <Text
            style={{
              color: theme.colors.onPrimary,
              fontSize: theme.fontSize.md,
              fontWeight: '700',
            }}
          >
            Falar com a gestora
          </Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
