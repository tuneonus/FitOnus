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

export function FoodItemSheet({ target, onClose }: FoodItemSheetProps) {
  const { colors } = useTheme();
  const { scaleItem, removeItem, restoreEntry } = useNutritionStore();
  const [factor, setFactor] = useState(1);

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
            title="Remove"
            onPress={() => {
              removeItem(entry.id, item.id);
              showToast({
                message: `${item.name} removed`,
                actionLabel: 'Undo',
                onAction: () => {
                  useNutritionStore.getState().removeEntry(entry.id);
                  restoreEntry(entry);
                },
              });
              close();
            }}
          />
          <Button
            appearance="premium"
            size="lg"
            title="Save"
            style={{ flex: 1 }}
            disabled={factor === 1}
            onPress={() => {
              scaleItem(entry.id, item.id, factor);
              showToast({ message: 'Portion updated' });
              close();
            }}
          />
        </View>
      }
    >
      <View style={styles.sheetContent}>
        <Text style={[styles.portionLabel, { color: colors.muted }]}>Portion</Text>
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
