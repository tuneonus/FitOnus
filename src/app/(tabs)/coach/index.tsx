import React, { useRef } from 'react';
import { View, StyleSheet, FlatList, KeyboardAvoidingView, Platform } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { ScreenContainer } from '@/components/shared/screen-container';
import { useTheme } from '@/hooks/use-theme';
import { ChatMessage } from '@/features/coach/components/chat-message';
import { ChatInputBar } from '@/features/coach/components/chat-input-bar';
import { SuggestedPrompts } from '@/features/coach/components/suggested-prompts';
import { useChat } from '@/features/coach/hooks/use-chat';
import { Spacing } from '@/constants/theme';
import { Text } from '@/components/ui/text';
import { History, Sparkles } from 'lucide-react-native';
import { Pressable } from 'react-native';

export default function CoachScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  // We use a fixed mock conversation ID for this phase
  const { messages, isLoading, isStreaming, sendMessage } = useChat('c1');
  const flatListRef = useRef<FlatList>(null);

  return (
    <ScreenContainer edges={['top']} style={{ backgroundColor: colors.background }}>
      <Stack.Screen 
        options={{ 
          headerShown: true, 
          title: 'AI Coach',
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerShadowVisible: false,
          headerRight: () => (
            <Pressable 
              onPress={() => router.push('/(tabs)/coach/history')}
              style={{ padding: Spacing.sm }}
            >
              <History size={24} color={colors.textSecondary} />
            </Pressable>
          ),
          headerLeft: () => (
            <View style={{ marginLeft: Spacing.sm, marginRight: Spacing.xs }}>
              <Sparkles size={20} color={colors.primary} />
            </View>
          )
        }} 
      />
      
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={flatListRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.messageList}
          renderItem={({ item, index }) => (
            <ChatMessage 
              message={item} 
              isStreaming={isStreaming && index === messages.length - 1 && item.role === 'assistant'} 
            />
          )}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          onLayout={() => flatListRef.current?.scrollToEnd({ animated: true })}
          ListEmptyComponent={
            !isLoading ? (
              <View style={styles.emptyState}>
                <Text variant="headlineMedium" style={{ textAlign: 'center', marginBottom: Spacing.sm }}>
                  Ready to crush your goals?
                </Text>
                <Text variant="bodyLarge" style={{ color: colors.textSecondary, textAlign: 'center' }}>
                  I'm your personal AI Coach. Ask me about workouts, nutrition, or anything health related!
                </Text>
              </View>
            ) : null
          }
        />
        
        {messages.length === 0 && !isLoading && (
          <SuggestedPrompts onSelect={sendMessage} />
        )}
        
        <ChatInputBar onSend={sendMessage} isDisabled={isStreaming} />
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  messageList: {
    padding: Spacing.md,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.xl,
    minHeight: 300,
  }
});
