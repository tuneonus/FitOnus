import React, { useState } from 'react';
import { View, StyleSheet, TextInput, Pressable, Keyboard } from 'react-native';
import { Text } from '@/components/ui/text';
import { useTheme } from '@/hooks/use-theme';
import { Spacing, BorderRadius } from '@/constants/theme';
import { LoggedSet } from '../types/workout';
import { Check, Edit2 } from 'lucide-react-native';

interface SetLoggerProps {
  setNumber: number;
  previousWeight?: number;
  previousReps?: number;
  onLog: (weight: number, reps: number) => void;
  loggedSet?: LoggedSet;
}

export const SetLogger = ({ setNumber, previousWeight, previousReps, onLog, loggedSet }: SetLoggerProps) => {
  const { colors } = useTheme();
  
  const [weight, setWeight] = useState(previousWeight?.toString() || '');
  const [reps, setReps] = useState(previousReps?.toString() || '');

  const isLogged = !!loggedSet?.isCompleted;

  const handleLog = () => {
    if (!weight || !reps) return;
    onLog(parseFloat(weight), parseInt(reps, 10));
    Keyboard.dismiss();
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.backgroundElement, borderColor: colors.border }]}>
      <View style={styles.header}>
        <Text variant="labelLarge" style={{ color: colors.textSecondary }}>Set {setNumber}</Text>
        {isLogged && (
          <View style={[styles.badge, { backgroundColor: colors.successLight }]}>
            <Check size={14} color={colors.success} />
            <Text variant="labelSmall" style={{ color: colors.success, marginLeft: 4 }}>Completed</Text>
          </View>
        )}
      </View>

      <View style={styles.inputsRow}>
        <View style={styles.inputGroup}>
          <Text variant="labelMedium" style={{ color: colors.textTertiary, marginBottom: 4 }}>Weight (kg)</Text>
          <TextInput
            style={[
              styles.input, 
              { backgroundColor: colors.background, color: colors.text, borderColor: colors.border },
              isLogged && { opacity: 0.5 }
            ]}
            keyboardType="decimal-pad"
            value={isLogged ? loggedSet.weightKg?.toString() : weight}
            onChangeText={setWeight}
            editable={!isLogged}
            placeholder="0"
            placeholderTextColor={colors.textTertiary}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text variant="labelMedium" style={{ color: colors.textTertiary, marginBottom: 4 }}>Reps</Text>
          <TextInput
            style={[
              styles.input, 
              { backgroundColor: colors.background, color: colors.text, borderColor: colors.border },
              isLogged && { opacity: 0.5 }
            ]}
            keyboardType="number-pad"
            value={isLogged ? loggedSet.reps?.toString() : reps}
            onChangeText={setReps}
            editable={!isLogged}
            placeholder="0"
            placeholderTextColor={colors.textTertiary}
          />
        </View>

        {!isLogged ? (
          <Pressable 
            style={[
              styles.actionBtn, 
              { backgroundColor: weight && reps ? colors.primary : colors.backgroundSelected }
            ]}
            onPress={handleLog}
          >
            <Check size={24} color={weight && reps ? colors.background : colors.textTertiary} />
          </Pressable>
        ) : (
          <Pressable 
            style={[styles.actionBtn, { backgroundColor: colors.backgroundSelected }]}
            onPress={() => {}} // In a real app, this would un-log the set
          >
            <Edit2 size={20} color={colors.textSecondary} />
          </Pressable>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: Spacing.md,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    marginBottom: Spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    borderRadius: BorderRadius.sm,
  },
  inputsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.md,
  },
  inputGroup: {
    flex: 1,
  },
  input: {
    height: 48,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.md,
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
  },
  actionBtn: {
    width: 48,
    height: 48,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  }
});
