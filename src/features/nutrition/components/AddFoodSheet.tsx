import React, { useState } from 'react';
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
  const { addEntry, removeEntry } = useNutritionStore();
  const [mode, setMode] = useState<'pick' | 'manual'>('pick');
  const [meal, setMeal] = useState<MealType>(initialMeal);
  const [form, setForm] = useState({ name: '', kcal: '', protein: '', carbs: '', fat: '' });
  const [submitted, setSubmitted] = useState(false);

  const close = () => {
    setMode('pick');
    setSubmitted(false);
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
      detail: 'Database of 1M+ foods',
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

  const saveManual = () => {
    setSubmitted(true);
    if (!form.name.trim() || !(Number(form.kcal) > 0)) return;
    const id = addEntry({
      meal,
      time: 'Just now',
      method: 'manual',
      items: [
        {
          id: `q-${Date.now()}`,
          name: form.name,
          serving: '1 serving',
          kcal: Number(form.kcal),
          protein: Number(form.protein) || 0,
          carbs: Number(form.carbs) || 0,
          fat: Number(form.fat) || 0,
          fiber: 0,
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
  };

  return (
    <BottomSheet
      visible={open}
      onClose={close}
      title={mode === 'pick' ? `Add to ${mealLabels[initialMeal]}` : 'Quick add'}
      footer={
        mode === 'manual' ? (
          <Button size="lg" fullWidth title="Add food" onPress={saveManual} />
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
                activeOpacity={0.7}
                onPress={onClick}
                style={[
                  styles.methodCard,
                  { backgroundColor: colors.surface2 },
                  isFullWidth ? { width: '100%' } : { width: '48.5%' },
                ]}
              >
                <Icon size={22} color={colors.ink} />
                <Text style={[styles.methodLabel, { color: colors.ink }]}>
                  {label}
                </Text>
                <Text style={[styles.methodDetail, { color: colors.muted }]}>
                  {detail}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : (
        <View style={styles.manualForm}>
          <SegmentedControl
            label="Meal"
            options={mealOrder.map((m) => ({ value: m, label: mealLabels[m] }))}
            value={meal}
            onChange={(val) => setMeal(val as MealType)}
          />
          <TextField
            label="Food name"
            placeholder="e.g. Homemade poha"
            value={form.name}
            onChangeText={(text) => setForm({ ...form, name: text })}
            error={nameError}
          />
          <TextField
            label="Calories"
            keyboardType="numeric"
            suffix="kcal"
            value={form.kcal}
            onChangeText={(text) =>
              setForm({ ...form, kcal: text.replace(/[^\d]/g, '') })
            }
            error={kcalError}
          />
          <View style={styles.macroInputs}>
            {(['protein', 'carbs', 'fat'] as const).map((k) => (
              <View key={k} style={{ flex: 1 }}>
                <TextField
                  label={k[0]!.toUpperCase() + k.slice(1)}
                  keyboardType="decimal-pad"
                  suffix="g"
                  value={form[k]}
                  onChangeText={(text) =>
                    setForm({ ...form, [k]: text.replace(/[^\d.]/g, '') })
                  }
                />
              </View>
            ))}
          </View>
          <Text style={[styles.manualNote, { color: colors.muted }]}>
            Manual entries are marked as logged by you.
          </Text>
        </View>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 20,
    paddingBottom: 24,
  },
  methodCard: {
    borderRadius: 20,
    padding: 16,
    minHeight: 100,
  },
  methodLabel: {
    fontSize: 15,
    fontWeight: '600',
    marginTop: 12,
  },
  methodDetail: {
    fontSize: 12,
    marginTop: 2,
  },
  manualForm: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 16,
  },
  macroInputs: {
    flexDirection: 'row',
    gap: 8,
  },
  manualNote: {
    fontSize: 12,
    marginTop: 4,
  },
});

