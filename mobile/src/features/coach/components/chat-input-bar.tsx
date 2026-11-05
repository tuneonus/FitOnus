import React, { useState } from 'react';
import { View, StyleSheet, TextInput, Pressable } from 'react-native';
import { useTheme } from '@/hooks/use-theme';
import { Spacing, BorderRadius } from '@/constants/theme';
import { SendHorizontal } from 'lucide-react-native';

interface ChatInputBarProps {
  onSend: (text: string) => void;
  isDisabled?: boolean;
}

export const ChatInputBar = ({ onSend, isDisabled = false }: ChatInputBarProps) => {
  const [text, setText] = useState('');
  const { colors } = useTheme();

  const handleSend = () => {
    if (text.trim().length > 0 && !isDisabled) {
      onSend(text.trim());
      setText('');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background, borderTopColor: colors.border }]}>
      <TextInput
        style={[styles.input, { backgroundColor: colors.backgroundElement, color: colors.text }]}
        placeholder="Ask Coach..."
        placeholderTextColor={colors.textTertiary}
        value={text}
        onChangeText={setText}
        multiline
        maxLength={500}
      />
      <Pressable 
        style={[styles.sendButton, { 
          backgroundColor: text.trim().length > 0 && !isDisabled ? colors.primary : colors.backgroundSelected 
        }]}
        onPress={handleSend}
        disabled={text.trim().length === 0 || isDisabled}
      >
        <SendHorizontal size={20} color={text.trim().length > 0 && !isDisabled ? colors.textInverse : colors.textTertiary} />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    padding: Spacing.md,
    borderTopWidth: 1,
    alignItems: 'flex-end',
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 16,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: Spacing.sm,
  }
});
