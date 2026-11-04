import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { useNavigation } from '../../../../app/navigation/NavigationContext';
import type { Block } from '../../types/coach';
import { useTheme } from '@/hooks/use-theme';

export function LinkBlock({ block }: { block: Extract<Block, { type: 'link' }> }) {
  const { colors } = useTheme();
  const { navigate } = useNavigation();

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => navigate(block.route, block.params)}
      style={[
        styles.container,
        {
          backgroundColor: colors.surface,
          borderColor: colors.line,
        },
      ]}
    >
      <View style={styles.textWrap}>
        <Text style={[styles.label, { color: colors.ink }]}>{block.label}</Text>
        <Text style={[styles.description, { color: colors.muted }]}>
          {block.description}
        </Text>
      </View>
      <ChevronRight size={18} color={colors.muted} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
    gap: 12,
    marginTop: 8,
  },
  textWrap: {
    flex: 1,
  },
  label: {
    fontSize: 14.5,
    fontWeight: '600',
  },
  description: {
    fontSize: 12.5,
    marginTop: 2,
  },
});

