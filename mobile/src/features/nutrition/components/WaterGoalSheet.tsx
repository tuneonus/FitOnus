import { premium } from '@/shared/theme/premium';
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Minus, Plus } from 'lucide-react-native';
import { BottomSheet } from '../../../shared/components/ui/BottomSheet';
import { Button } from '../../../shared/components/ui/Button';
import { showToast } from '../../../shared/stores/toastStore';
import { useNutritionStore } from '../store/nutritionStore';
import type { DailyNutritionTargets } from '../types/nutrition';
import {
  clampWaterGoal,
  describeWaterGoal,
  formatLitres,
  stepWaterGoal,
  WATER_GOAL_MAX_ML,
  WATER_GOAL_MIN_ML,
} from '../utils/water-goal';
import { useTheme } from '@/hooks/use-theme';

type WaterGoalSheetProps = {
  open: boolean;
  /** The goal now in effect (the member's own, or the estimate) and where it came from. */
  targets: DailyNutritionTargets | null;
  onClose: () => void;
};

/** Where the picker starts when there is no goal at all (nothing to estimate from). */
const STARTING_GOAL_ML = 2000;

/** Set the daily water goal, or go back to the estimate from the member's weight. */
export function WaterGoalSheet({ open, targets, onClose }: WaterGoalSheetProps) {
  const { colors } = useTheme();
  const setWaterTarget = useNutritionStore((state) => state.setWaterTarget);
  const [draft, setDraft] = useState(targets?.waterMl ?? STARTING_GOAL_ML);
  const [busy, setBusy] = useState(false);

  // Start from the current goal every time the sheet opens.
  useEffect(() => {
    if (open) setDraft(clampWaterGoal(targets?.waterMl ?? STARTING_GOAL_ML));
  }, [open, targets?.waterMl]);

  const save = async (next: number | null) => {
    if (busy) return;
    setBusy(true);
    try {
      await setWaterTarget(next);
      showToast({ message: next === null ? 'Using your estimated goal' : 'Water goal saved' });
      onClose();
    } catch {
      showToast({ tone: 'error', message: 'Couldn’t save your water goal. Please try again.' });
    } finally {
      setBusy(false);
    }
  };

  const canClear = targets?.waterSource === 'saved';

  return (
    <BottomSheet
      visible={open}
      onClose={onClose}
      title="Daily water goal"
      description={describeWaterGoal(targets)}
    >
      <View style={styles.body}>
        <View style={styles.stepper}>
          <StepButton
            icon={Minus}
            label="Lower the goal by 250 millilitres"
            disabled={busy || draft <= WATER_GOAL_MIN_ML}
            onPress={() => setDraft((value) => stepWaterGoal(value, -1))}
          />
          <Text
            accessibilityLiveRegion="polite"
            style={[premium.type.metric, styles.value, { color: colors.ink }]}
          >
            {formatLitres(draft)}
          </Text>
          <StepButton
            icon={Plus}
            label="Raise the goal by 250 millilitres"
            disabled={busy || draft >= WATER_GOAL_MAX_ML}
            onPress={() => setDraft((value) => stepWaterGoal(value, 1))}
          />
        </View>
        <Button
          title="Save goal"
          loading={busy}
          disabled={busy || draft === targets?.waterMl}
          onPress={() => {
            void save(draft);
          }}
        />
        {canClear ? (
          <Button
            title="Use the estimate from my weight"
            variant="ghost"
            disabled={busy}
            onPress={() => {
              void save(null);
            }}
          />
        ) : null}
      </View>
    </BottomSheet>
  );
}

function StepButton({
  icon: Icon,
  label,
  disabled,
  onPress,
}: {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [
        styles.step,
        { backgroundColor: colors.surface2, opacity: disabled ? 0.4 : pressed ? 0.7 : 1 },
      ]}
    >
      <Icon size={20} color={colors.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingBottom: 24, gap: 16 },
  stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  value: { flex: 1, textAlign: 'center' },
  step: {
    width: premium.layout.touch,
    height: premium.layout.touch,
    borderRadius: premium.layout.touch / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
