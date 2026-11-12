import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BottomSheet } from '@/shared/components/ui/BottomSheet';
import { Button } from '@/shared/components/ui/Button';
import { Stepper } from '@/shared/components/ui/Stepper';
import { TextField } from '@/shared/components/ui/TextField';
import { showToast } from '@/shared/stores/toastStore';
import { useWeightStore } from '../store/weightStore';
import { useTheme } from '@/hooks/use-theme';
import { useSettingsStore } from '@/shared/stores/settingsStore';
import { kgToLb, lbToKg } from '@/shared/utils/unit-conversion';

export function AddWeightSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const units = useSettingsStore((s) => s.units);
  const isImperial = units === 'imperial';
  const { entries, addEntry } = useWeightStore();
  const lastEntry = entries[entries.length - 1];

  const getDefaultVal = () => {
    const baseKg = lastEntry ? lastEntry.value : 70;
    return isImperial ? (kgToLb(baseKg) ?? 154) : baseKg;
  };

  const [value, setValue] = useState(getDefaultVal());
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setValue(getDefaultVal());
    }
  }, [open, isImperial, lastEntry]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const canonicalKg = isImperial ? (lbToKg(value) ?? value) : value;
      const result = await addEntry(canonicalKg, note || undefined);
      showToast({
        message:
          result === 'queued'
            ? 'Weight saved on this device · waiting to sync'
            : `${value.toFixed(1)} ${isImperial ? 'lb' : 'kg'} saved`,
      });
      setNote('');
      onClose();
    } catch {
      showToast({ tone: 'error', message: 'Could not save weight. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  const todayStr = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(new Date());

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Log weight"
      description={`Today · ${todayStr}`}
      footer={
        <Button size="lg" fullWidth onPress={save} loading={saving}>
          Save
        </Button>
      }
    >
      <View style={styles.stepperWrapper}>
        <Stepper
          size="lg"
          label="Weight"
          value={value}
          onChange={setValue}
          step={isImperial ? 0.2 : 0.1}
          decimals={1}
          min={isImperial ? 66 : 30}
          max={isImperial ? 550 : 250}
          unit={isImperial ? 'lb' : 'kg'}
        />
      </View>
      <TextField
        label="Note (optional)"
        placeholder="e.g. after a high-salt dinner"
        value={note}
        onChangeText={setNote}
      />
      <Text style={[styles.footnote, { color: colors.muted }]}>
        Tip: weigh at the same time each morning. Smart-scale sync is planned for a future release.
      </Text>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  stepperWrapper: {
    paddingVertical: 12,
  },
  footnote: {
    marginTop: 12,
    fontSize: 12.5,
    lineHeight: 17,
  },
});
