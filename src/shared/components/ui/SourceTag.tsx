import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Edit2 } from 'lucide-react-native';
import type { DataSource } from '../../types/health';
import { useTheme } from '@/hooks/use-theme';

export type SourceTagProps = {
  source: DataSource;
  tone?: 'default' | 'hero';
};

export function SourceTag({ source, tone = 'default' }: SourceTagProps) {
  const { colors } = useTheme();

  const textColor = tone === 'hero' ? colors.heroMuted : colors.muted;

  return (
    <View style={styles.container}>
      {source.kind === 'synced' && (
        <View style={[styles.dot, { backgroundColor: colors.good }]} />
      )}
      {source.kind === 'estimated' && (
        <View style={[styles.estBox, { borderColor: textColor }]}>
          <Text style={[styles.estText, { color: textColor }]}>Est.</Text>
        </View>
      )}
      {source.kind === 'manual' && (
        <Edit2 size={11} color={textColor} style={styles.icon} />
      )}
      <Text style={[styles.label, { color: textColor }]}>{source.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  estBox: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 3,
    paddingHorizontal: 3,
    paddingVertical: 1,
  },
  estText: {
    fontSize: 9,
    fontWeight: '600',
  },
  icon: {
    marginRight: 1,
  },
  label: {
    fontSize: 11,
  },
});

