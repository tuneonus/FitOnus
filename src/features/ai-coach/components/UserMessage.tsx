import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/use-theme';

export function UserMessage({ text }: { text: string }) {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: colors.ink,
          },
        ]}
      >
        <Text style={[styles.bubbleText, { color: colors.bg }]}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginVertical: 4,
  },
  bubble: {
    maxWidth: '82%',
    borderRadius: 20,
    borderBottomRightRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 20,
  },
});

