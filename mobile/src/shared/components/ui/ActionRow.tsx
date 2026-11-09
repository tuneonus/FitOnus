import React from 'react';
import { Pressable, View, Text, StyleSheet } from 'react-native';
import { ChevronRight } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';
import { premium } from '@/shared/theme/premium';

export function ActionRow({
  icon: Icon,
  title,
  detail,
  onPress,
  accessibilityLabel,
}: {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  title: string;
  detail: string;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? `${title}. ${detail}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: colors.line, opacity: pressed ? 0.65 : 1 },
      ]}
    >
      <View style={[styles.icon, { backgroundColor: colors.surface2 }]}>
        <Icon size={20} color={colors.ink} />
      </View>
      <View style={styles.copy}>
        <Text style={[premium.type.label, { color: colors.ink }]}>{title}</Text>
        <Text style={[premium.type.caption, { color: colors.muted }]}>{detail}</Text>
      </View>
      <ChevronRight size={18} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: premium.radius.control,
    justifyContent: 'center',
    alignItems: 'center',
  },
  copy: { flex: 1, gap: 3 },
});
