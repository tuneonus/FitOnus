import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/hooks/use-theme';
import { Spacing, BorderRadius } from '@/constants/theme';
import { LucideIcon, ChevronRight } from 'lucide-react-native';

interface SettingRowProps {
  label: string;
  icon: LucideIcon;
  value?: string;
  onPress: () => void;
  destructive?: boolean;
}

export const SettingRow = ({ label, icon: Icon, value, onPress, destructive }: SettingRowProps) => {
  const { colors } = useTheme();

  return (
    <Pressable 
      style={({ pressed }) => [
        styles.row, 
        { 
          backgroundColor: pressed ? colors.backgroundElement : colors.background,
          borderBottomColor: colors.border
        }
      ]}
      onPress={onPress}
    >
      <View style={[styles.iconWrapper, { backgroundColor: destructive ? colors.error + '20' : colors.backgroundSelected }]}>
        <Icon size={18} color={destructive ? colors.error : colors.textSecondary} />
      </View>
      <Text variant="bodyLarge" style={[styles.label, { color: destructive ? colors.error : colors.text }]}>
        {label}
      </Text>
      
      {value && (
        <Text variant="bodyMedium" style={{ color: colors.textSecondary, marginRight: Spacing.sm }}>
          {value}
        </Text>
      )}
      <ChevronRight size={20} color={colors.textTertiary} />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconWrapper: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.sm,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.md,
  },
  label: {
    flex: 1,
  }
});
