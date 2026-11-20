import { premium } from '@/shared/theme/premium';
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Trash2 } from 'lucide-react-native';
import { BottomSheet } from '../../../shared/components/ui/BottomSheet';
import { Button } from '../../../shared/components/ui/Button';
import { Stepper } from '../../../shared/components/ui/Stepper';
import { showToast } from '../../../shared/stores/toastStore';
import { useNutritionStore } from '../store/nutritionStore';
import type { FoodItem, MealEntry } from '../types/nutrition';
import { useTheme } from '@/hooks/use-theme';

type FoodItemSheetProps = {
  target: { entry: MealEntry; item: FoodItem } | null;
  onClose: () => void;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

export function FoodItemSheet({ target, onClose }: FoodItemSheetProps) {
  const { colors } = useTheme();
  const { scaleItem, removeItem, updateMeal, deleteMeal, restoreMeal } = useNutritionStore();
  const [factor, setFactor] = useState(1);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setFactor(1);
    onClose();
  };

  if (!target) {
    return (
      <BottomSheet visible={false} onClose={close}>
        <View />
      </BottomSheet>
    );
  }

  const { entry, item } = target;
  const isOnlyFood = entry.items.length <= 1;
  const editable = entry.isSynced !== false;
  const currentMultiplier = item.servingMultiplier ?? 1;

  const run = async (work: () => Promise<void>, failure: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await work();
    } catch {
      showToast({ tone: 'error', message: failure });
    } finally {
      setBusy(false);
    }
  };

  const deleteWholeMeal = () =>
    run(async () => {
      await deleteMeal(entry.id);
      showToast({
        message: 'Meal deleted',
        actionLabel: 'Undo',
        onAction: () => {
          void restoreMeal(entry.id).catch(() =>
            showToast({ tone: 'error', message: 'Could not restore the meal.' }),
          );
        },
      });
      close();
    }, 'Could not delete this meal. Please try again.');

  const removeFood = () =>
    run(async () => {
      await removeItem(entry.id, item.id);
      showToast({
        message: `${item.name} removed`,
        actionLabel: 'Undo',
        onAction: () => {
          // Puts the foods back as they were: the others by their stored ids, the removed one as a new line.
          void updateMeal(entry.id, entry.items, entry.notes ?? undefined).catch(() =>
            showToast({ tone: 'error', message: 'Could not restore the food.' }),
          );
        },
      });
      close();
    }, 'Could not update this meal. Please try again.');

  const savePortion = () =>
    run(async () => {
      await scaleItem(entry.id, item.id, factor);
      showToast({ message: 'Portion updated' });
      close();
    }, 'Could not update this portion. Please try again.');

  return (
    <BottomSheet
      visible={true}
      onClose={close}
      title={item.name}
      description={`${item.serving}${item.estimated ? ' · AI estimate' : ''}`}
      footer={
        <View style={styles.footerRow}>
          <Button
            appearance="premium"
            variant="danger"
            size="lg"
            icon={Trash2}
            title={isOnlyFood ? 'Delete meal' : 'Remove'}
            disabled={!editable || busy}
            onPress={() => {
              void (isOnlyFood ? deleteWholeMeal() : removeFood());
            }}
          />
          <Button
            appearance="premium"
            size="lg"
            title="Save"
            style={{ flex: 1 }}
            disabled={factor === 1 || !editable || busy}
            onPress={() => {
              void savePortion();
            }}
          />
        </View>
      }
    >
      <View style={styles.sheetContent}>
        {!editable ? (
          <Text style={{ color: colors.muted }}>Sync this meal before editing.</Text>
        ) : null}
        <Text style={[styles.portionLabel, { color: colors.muted }]}>
          Portion · change it relative to what you logged
        </Text>
        <View style={{ marginTop: 8 }}>
          <Stepper
            appearance="premium"
            label="Portion multiplier"
            value={factor}
            onChange={setFactor}
            step={0.25}
            min={0.25}
            max={4}
            decimals={2}
            unit="×"
          />
        </View>
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.portionLabel, { color: colors.muted, marginTop: 8 }]}
        >
          {factor === 1
            ? `Logged at ${currentMultiplier}× of the base serving.`
            : `${currentMultiplier}× becomes ${round2(currentMultiplier * factor)}× of the base serving.`}
        </Text>

        <View style={[styles.macrosGrid, { backgroundColor: colors.surface2 }]}>
          {[
            ['kcal', Math.round(item.kcal * factor)],
            ['Protein', `${Math.round(item.protein * factor)}g`],
            ['Carbs', `${Math.round(item.carbs * factor)}g`],
            ['Fat', `${Math.round(item.fat * factor)}g`],
          ].map(([l, v]) => (
            <View key={l} style={styles.macroBox}>
              <Text style={[styles.macroLabel, { color: colors.muted }]}>{l}</Text>
              <Text style={[styles.macroVal, { color: colors.ink }]}>{v}</Text>
            </View>
          ))}
        </View>

        {!isOnlyFood && editable ? (
          <View style={{ marginTop: 16 }}>
            <Button
              appearance="premium"
              variant="ghost"
              title="Delete whole meal"
              disabled={busy}
              onPress={() => {
                void deleteWholeMeal();
              }}
            />
          </View>
        ) : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  footerRow: {
    flexDirection: 'row',
    gap: 8,
  },
  sheetContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  portionLabel: {
    ...premium.type.caption,
  },
  macrosGrid: {
    flexDirection: 'row',
    borderRadius: 18,
    padding: 14,
    marginTop: 20,
  },
  macroBox: {
    flex: 1,
    alignItems: 'center',
  },
  macroLabel: {
    ...premium.type.caption,
  },
  macroVal: {
    ...premium.type.body,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
});
