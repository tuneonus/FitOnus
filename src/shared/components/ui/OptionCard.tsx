import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet, ViewStyle } from 'react-native';
import { Check } from 'lucide-react-native';
import { useTheme } from '@/hooks/use-theme';

export type OptionCardProps = {
  title: string;
  description?: string | undefined;
  icon?: React.ComponentType<{ size?: number; color?: string }> | undefined;
  selected: boolean;
  onSelect: () => void;
  multi?: boolean | undefined;
  style?: ViewStyle | undefined;
};

export function OptionCard({
  title,
  description,
  icon: Icon,
  selected,
  onSelect,
  multi = false,
  style,
}: OptionCardProps) {
  const { colors } = useTheme();

  return (
    <TouchableOpacity
      activeOpacity={0.75}
      onPress={onSelect}
      style={[
        styles.card,
        {
          borderColor: selected ? colors.ink : colors.line,
          backgroundColor: colors.surface,
        },
        style,
      ]}
    >
      {Icon ? (
        <View
          style={[
            styles.iconBox,
            {
              backgroundColor: selected ? colors.accent : colors.surface2,
            },
          ]}
        >
          <Icon
            size={19}
            color={selected ? colors.accentInk : colors.ink}
          />
        </View>
      ) : null}

      <View style={styles.textColumn}>
        <Text style={[styles.title, { color: colors.ink }]}>{title}</Text>
        {description ? (
          <Text style={[styles.description, { color: colors.muted }]}>
            {description}
          </Text>
        ) : null}
      </View>

      <View
        style={[
          styles.checkIndicator,
          multi ? styles.checkbox : styles.radio,
          {
            borderColor: selected ? colors.ink : colors.line,
            backgroundColor: selected ? colors.ink : 'transparent',
          },
        ]}
      >
        {selected ? <Check size={13} color={colors.bg} strokeWidth={3} /> : null}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 20,
    borderWidth: 1.5,
    marginVertical: 4,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  textColumn: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  description: {
    fontSize: 13,
    lineHeight: 18,
    marginTop: 2,
  },
  checkIndicator: {
    width: 24,
    height: 24,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 12,
  },
  radio: {
    borderRadius: 12,
  },
  checkbox: {
    borderRadius: 6,
  },
});
