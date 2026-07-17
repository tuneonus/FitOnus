import React from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/hooks/use-theme';
import { Spacing, BorderRadius } from '@/constants/theme';
import { MessageCircle } from 'lucide-react-native';

interface SuggestedPromptsProps {
  onSelect: (prompt: string) => void;
}

const PROMPTS = [
  "What should I eat for breakfast?",
  "Generate a quick core workout",
  "How am I doing this week?",
  "Log a glass of water"
];

export const SuggestedPrompts = ({ onSelect }: SuggestedPromptsProps) => {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {PROMPTS.map((prompt, index) => (
          <Pressable 
            key={index} 
            style={[styles.chip, { backgroundColor: colors.backgroundElement, borderColor: colors.border }]}
            onPress={() => onSelect(prompt)}
          >
            <MessageCircle size={14} color={colors.primary} style={{ marginRight: Spacing.xs }} />
            <Text variant="labelMedium" style={{ color: colors.text }}>{prompt}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: Spacing.sm,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    gap: Spacing.sm,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  }
});
