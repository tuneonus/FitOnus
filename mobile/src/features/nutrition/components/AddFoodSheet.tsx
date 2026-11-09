import { manualFoodError } from '../utils/manual-entry-validation';
import { premium } from '@/shared/theme/premium';
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Camera, Mic, Edit3, ScanBarcode, Search } from 'lucide-react-native';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { BottomSheet } from '../../../shared/components/ui/BottomSheet';
import { Button } from '../../../shared/components/ui/Button';
import { TextField } from '../../../shared/components/ui/TextField';
import { SegmentedControl } from '../../../shared/components/ui/SegmentedControl';
import { showToast } from '../../../shared/stores/toastStore';
import { useNutritionStore } from '../store/nutritionStore';
import { mealLabels, mealOrder } from '../constants/meals';
import type { MealType } from '../types/nutrition';
import { useTheme } from '@/hooks/use-theme';

type AddFoodSheetProps = {
  open: boolean;
  meal: MealType;
  onClose: () => void;
};

export function AddFoodSheet({ open, meal: initialMeal, onClose }: AddFoodSheetProps) {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const { logMeal, createCustomFood, removeEntry } = useNutritionStore();
  const [mode, setMode] = useState<'pick' | 'manual'>('pick');
  const [meal, setMeal] = useState<MealType>(initialMeal);
  const [form, setForm] = useState({ name: '', kcal: '', protein: '', carbs: '', fat: '' });
  const [submitted, setSubmitted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const saveLock = useRef(false);
  const formError = submitted ? manualFoodError(form) : null;
  useEffect(() => {
    if (open) {
      setMeal(initialMeal);
      setMode('pick');
      setSubmitted(false);
    }
  }, [open, initialMeal]);

  const close = () => {
    setMode('pick');
    setSubmitted(false);
    setIsSaving(false);
    onClose();
  };

  const go = (fn: () => void) => {
    close();
    fn();
  };

  const methods = [
    {
      icon: Search,
      label: 'Search food',
      detail: 'Verified and custom foods',
      onClick: () => go(() => navigate('foodSearch', { meal: initialMeal })),
    },
    {
      icon: Camera,
      label: 'Snap a photo',
      detail: 'AI estimates portions',
      onClick: () => go(() => navigate('mealPhoto', { meal: initialMeal })),
    },
    {
      icon: ScanBarcode,
      label: 'Scan barcode',
      detail: 'Packaged foods',
      onClick: () => go(() => navigate('barcodeScanner', { meal: initialMeal })),
    },
    {
      icon: Mic,
      label: 'Say it',
      detail: '“Two rotis and dal”',
      onClick: () => go(() => navigate('voiceMealEntry', { meal: initialMeal })),
    },
    {
      icon: Edit3,
      label: 'Quick add',
      detail: 'Enter calories and macros',
      onClick: () => setMode('manual'),
    },
  ];

  const nameError = submitted && !form.name.trim() ? 'Name the food.' : undefined;
  const kcalError = submitted && !(Number(form.kcal) > 0) ? 'Enter calories.' : undefined;

  const saveManual = async () => {
    setSubmitted(true);
    if (saveLock.current || manualFoodError(form)) return;
    saveLock.current = true;

    setIsSaving(true);
    const kcal = Number(form.kcal);
    const protein = Number(form.protein) || 0;
    const carbs = Number(form.carbs) || 0;
    const fat = Number(form.fat) || 0;

    let foodId: string | undefined;
    try {
      const created = await createCustomFood({
        name: form.name.trim(),
        servingSize: 1,
        servingUnit: 'serving',
        servingWeightG: 100,
        servingBasis: 'serving',
        calories: kcal,
        proteinG: protein,
        carbohydratesG: carbs,
        fatG: fat,
        fiberG: 0,
      });
      foodId = created.id;
    } catch {
      // Continue offline logging even if remote custom food creation fails
    }

    try {
      const id = await logMeal({
        mealType: meal,
        method: 'manual',
        items: [
          {
            id: foodId || `q-${Date.now()}`,
            name: form.name.trim(),
            serving: '1 serving',
            kcal,
            protein,
            carbs,
            fat,
            fiber: 0,
            isCustom: true,
          },
        ],
      });

      showToast({
        message: `Added to ${mealLabels[meal]}`,
        actionLabel: 'Undo',
        onAction: () => removeEntry(id),
      });

      setForm({ name: '', kcal: '', protein: '', carbs: '', fat: '' });
      close();
    } catch {
      showToast({ message: 'Couldn’t save food. Please try again.' });
    } finally {
      saveLock.current = false;
      setIsSaving(false);
    }
  };

  return (
    <BottomSheet
      visible={open}
      onClose={close}
      title={mode === 'pick' ? `Add to ${mealLabels[initialMeal]}` : 'Quick add'}
      footer={
        mode === 'manual' ? (
          <Button
            appearance="premium"
            size="lg"
            fullWidth
            title={isSaving ? 'Adding...' : 'Add food'}
            disabled={isSaving}
            onPress={saveManual}
          />
        ) : undefined
      }
    >
      {mode === 'pick' ? (
        <View style={styles.grid}>
          {methods.map(({ icon: Icon, label, detail, onClick }, i) => {
            const isFullWidth = i === methods.length - 1;
            return (
              <TouchableOpacity
                key={label}
                accessibilityRole="button"
                accessibilityLabel={label}
                activeOpacity={0.7}
                onPress={onClick}
                style={[
                  styles.methodCard,
                  { backgroundColor: colors.surface2 },
                  isFullWidth ? { width: '100%' } : { flexBasis: '45%', flexGrow: 1 },
                ]}
              >
                <View style={[styles.iconWrapper, { backgroundColor: colors.surface }]}>
                  <Icon size={20} color={colors.ink} />
                </View>
                <Text style={[styles.methodLabel, { color: colors.ink }]}>{label}</Text>
                <Text style={[styles.methodDetail, { color: colors.muted }]}>{detail}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <View style={styles.manualForm}>
          {formError ? (
            <Text accessibilityRole="alert" style={{ color: colors.bad }}>
              {formError}
            </Text>
          ) : null}
          <Text style={{ color: colors.muted }}>
            Enter the nutrition values you know. Blank macro fields will be logged as 0 g.
          </Text>
          <SegmentedControl
            appearance="premium"
            options={mealOrder.map((m) => ({ value: m, label: mealLabels[m] }))}
            value={meal}
            onChange={(val) => setMeal(val as MealType)}
          />

          <TextField
            appearance="premium"
            label="Food name"
            placeholder="e.g. Grandma's apple pie"
            value={form.name}
            onChangeText={(t) => setForm((f) => ({ ...f, name: t }))}
            error={nameError}
          />

          <View style={styles.macroRow}>
            <View style={{ flex: 1 }}>
              <TextField
                appearance="premium"
                label="Calories (kcal)"
                placeholder="0"
                keyboardType="numeric"
                value={form.kcal}
                onChangeText={(t) => setForm((f) => ({ ...f, kcal: t }))}
                error={kcalError}
              />
            </View>
            <View style={{ flex: 1 }}>
              <TextField
                appearance="premium"
                label="Protein (g)"
                placeholder="0"
                keyboardType="numeric"
                value={form.protein}
                onChangeText={(t) => setForm((f) => ({ ...f, protein: t }))}
              />
            </View>
          </View>

          <View style={styles.macroRow}>
            <View style={{ flex: 1 }}>
              <TextField
                appearance="premium"
                label="Carbs (g)"
                placeholder="0"
                keyboardType="numeric"
                value={form.carbs}
                onChangeText={(t) => setForm((f) => ({ ...f, carbs: t }))}
              />
            </View>
            <View style={{ flex: 1 }}>
              <TextField
                appearance="premium"
                label="Fat (g)"
                placeholder="0"
                keyboardType="numeric"
                value={form.fat}
                onChangeText={(t) => setForm((f) => ({ ...f, fat: t }))}
              />
            </View>
          </View>
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 8,
  },
  methodCard: {
    borderRadius: premium.radius.card,
    padding: 16,
    gap: 8,
  },
  iconWrapper: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  methodLabel: {
    ...premium.type.body,
  },
  methodDetail: {
    ...premium.type.caption,
  },
  manualForm: {
    gap: 16,
    marginTop: 8,
  },
  macroRow: {
    flexDirection: 'row',
    gap: 12,
  },
});
