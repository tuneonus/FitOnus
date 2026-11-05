import React, { useEffect, useState } from 'react';
import { View, StyleSheet, FlatList, Pressable } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/shared/screen-container';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/hooks/use-theme';
import { Spacing, BorderRadius } from '@/constants/theme';
import { CoachService } from '@/features/coach/services/coach-service';
import { Conversation } from '@/features/coach/types/coach';
import { MessageSquare, ChevronRight, History } from 'lucide-react-native';
import { Loading } from '@/components/ui/loading';
import { Button } from '@/components/ui/button';

export default function CoachHistoryScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const data = await CoachService.getConversations();
        setConversations(data);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    fetchHistory();
  }, []);

  const renderItem = ({ item }: { item: Conversation }) => {
    const date = new Date(item.lastMessageAt).toLocaleDateString();
    
    return (
      <Pressable 
        style={[styles.historyCard, { backgroundColor: colors.backgroundElement, borderBottomColor: colors.border }]}
        onPress={() => {
          // Navigate to specific chat if we supported dynamic routing
          // router.push(`/coach/${item.id}`);
          router.back();
        }}
      >
        <View style={[styles.iconContainer, { backgroundColor: colors.primaryLight }]}>
          <MessageSquare size={20} color={colors.primary} />
        </View>
        <View style={styles.content}>
          <Text variant="bodyLarge" style={{ fontWeight: '600' }}>{item.title}</Text>
          <Text variant="labelMedium" style={{ color: colors.textSecondary, marginTop: 4 }}>
            {date} • {item.messageCount} messages
          </Text>
        </View>
        <ChevronRight size={20} color={colors.textTertiary} />
      </Pressable>
    );
  };

  return (
    <ScreenContainer edges={['bottom']} style={{ backgroundColor: colors.background }}>
      <Stack.Screen 
        options={{ 
          headerShown: true, 
          title: 'Chat History',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerShadowVisible: false,
        }} 
      />
      
      {isLoading ? (
        <Loading fullScreen />
      ) : conversations.length === 0 ? (
        <View style={styles.emptyState}>
          <History size={48} color={colors.textTertiary} />
          <Text variant="headlineSmall" style={{ color: colors.textSecondary, marginTop: Spacing.md }}>
            No history yet
          </Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          renderItem={renderItem}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  listContainer: {
    padding: Spacing.md,
  },
  historyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  content: {
    flex: 1,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  }
});
