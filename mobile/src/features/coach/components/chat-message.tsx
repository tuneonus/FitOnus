import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { ChatMessage as ChatMessageType } from '../types/coach';
import { useTheme } from '@/hooks/use-theme';
import { Spacing, BorderRadius } from '@/constants/theme';
import { User, Sparkles } from 'lucide-react-native';

interface ChatMessageProps {
  message: ChatMessageType;
  isStreaming?: boolean;
}

export const ChatMessage = ({ message, isStreaming = false }: ChatMessageProps) => {
  const { colors } = useTheme();
  const isUser = message.role === 'user';

  return (
    <View style={[styles.container, isUser ? styles.userContainer : styles.aiContainer]}>
      {!isUser && (
        <View style={[styles.avatar, { backgroundColor: colors.primaryLight }]}>
          <Sparkles size={16} color={colors.primary} />
        </View>
      )}
      
      <View style={[
        styles.bubble, 
        isUser ? { backgroundColor: colors.primary } : { backgroundColor: colors.backgroundElement },
        isUser ? styles.userBubble : styles.aiBubble
      ]}>
        <Text variant="bodyLarge" style={{ color: isUser ? colors.textInverse : colors.text }}>
          {message.content}
          {isStreaming && <Text style={{ color: colors.primary }}> ▋</Text>}
        </Text>
      </View>
      
      {isUser && (
        <View style={[styles.avatar, { backgroundColor: colors.backgroundSelected }]}>
          <User size={16} color={colors.textSecondary} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    marginBottom: Spacing.lg,
    alignItems: 'flex-end',
  },
  userContainer: {
    justifyContent: 'flex-end',
  },
  aiContainer: {
    justifyContent: 'flex-start',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: Spacing.xs,
  },
  bubble: {
    maxWidth: '75%',
    padding: Spacing.md,
  },
  userBubble: {
    borderTopLeftRadius: BorderRadius.md,
    borderTopRightRadius: BorderRadius.md,
    borderBottomLeftRadius: BorderRadius.md,
    borderBottomRightRadius: 4,
  },
  aiBubble: {
    borderTopLeftRadius: BorderRadius.md,
    borderTopRightRadius: BorderRadius.md,
    borderBottomRightRadius: BorderRadius.md,
    borderBottomLeftRadius: 4,
  }
});
