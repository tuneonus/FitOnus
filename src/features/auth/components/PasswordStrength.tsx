import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Check, Circle } from 'lucide-react-native';
import { passwordStrength } from '../utils/validation';
import { useTheme } from '@/hooks/use-theme';

export function PasswordStrength({ password }: { password: string }) {
  const { colors } = useTheme();
  const { checks, score, label } = passwordStrength(password);

  if (!password) return null;

  const barColors = [colors.bad, colors.bad, colors.warn, colors.good];

  return (
    <View style={styles.container}>
      <View style={styles.barsRow}>
        <View style={styles.barsContainer}>
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={[
                styles.bar,
                {
                  backgroundColor:
                    i < score
                      ? barColors[score]
                      : colors.surface2,
                },
              ]}
            />
          ))}
        </View>
        <Text style={[styles.label, { color: colors.muted }]}>{label}</Text>
      </View>

      <View style={styles.checksList}>
        {checks.map((c) => (
          <View key={c.label} style={styles.checkItem}>
            {c.ok ? (
              <Check size={13} color={colors.good} strokeWidth={2.5} />
            ) : (
              <Circle size={10} color={colors.muted} />
            )}
            <Text
              style={[
                styles.checkText,
                { color: c.ok ? colors.good : colors.muted },
              ]}
            >
              {c.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 8,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  barsContainer: {
    flex: 1,
    flexDirection: 'row',
    gap: 4,
  },
  bar: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
  },
  checksList: {
    marginTop: 8,
    gap: 4,
  },
  checkItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  checkText: {
    fontSize: 12,
  },
});

