import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/hooks/use-theme';
import { Spacing, BorderRadius } from '@/constants/theme';
import { LucideIcon } from 'lucide-react-native';

interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  subValue?: string;
}

export const StatCard = ({ label, value, icon: Icon, subValue }: StatCardProps) => {
  const { colors } = useTheme();

  return (
    <View style={[styles.card, { backgroundColor: colors.backgroundElement, borderColor: colors.border }]}>
      <View style={[styles.iconWrapper, { backgroundColor: colors.backgroundSelected }]}>
        <Icon size={20} color={colors.primary} />
      </View>
      <View style={styles.content}>
        <Text variant="labelMedium" style={{ color: colors.textSecondary }}>{label}</Text>
        <Text variant="headlineSmall" style={{ color: colors.text, marginTop: 4 }}>{value}</Text>
        {subValue && (
          <Text variant="labelSmall" style={{ color: colors.textTertiary, marginTop: 2 }}>{subValue}</Text>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    flex: 1,
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  iconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.sm,
  },
  content: {
    flex: 1,
  }
});
