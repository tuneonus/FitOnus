import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BottomSheet } from '@/shared/components/ui/BottomSheet';
import { Button } from '@/shared/components/ui/Button';
import { Stepper } from '@/shared/components/ui/Stepper';
import { TextField } from '@/shared/components/ui/TextField';
import { showToast } from '@/shared/stores/toastStore';
import { useWeightStore } from '../store/weightStore';
import { useTheme } from '@/hooks/use-theme';

export function AddWeightSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const { entries, addEntry, undoLast } = useWeightStore();
  const lastEntry = entries[entries.length - 1];
  const [value, setValue] = useState(lastEntry ? lastEntry.value : 70);
  const [note, setNote] = useState('');

  const save = () => {
    const prev = addEntry(value, note || undefined);
    showToast({
      message: `${value.toFixed(1)} kg saved for today`,
      actionLabel: 'Undo',
      onAction: () => undoLast(prev),
    });
    setNote('');
    onClose();
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
        <Button size="lg" fullWidth onPress={save}>
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
          step={0.1}
          decimals={1}
          min={30}
          max={250}
          unit="kg"
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

