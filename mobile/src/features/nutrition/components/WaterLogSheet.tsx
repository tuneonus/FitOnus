import { premium } from '@/shared/theme/premium';
import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Trash2 } from 'lucide-react-native';
import { BottomSheet } from '../../../shared/components/ui/BottomSheet';
import { showToast } from '../../../shared/stores/toastStore';
import { useNutritionStore } from '../store/nutritionStore';
import type { WaterIntakeView } from '../types/nutrition';
import { useTheme } from '@/hooks/use-theme';

type WaterLogSheetProps = {
  open: boolean;
  entries: WaterIntakeView[];
  onClose: () => void;
};

/** The day's water entries, one per row, each deletable with an undo that logs the same entry again. */
export function WaterLogSheet({ open, entries, onClose }: WaterLogSheetProps) {
  const { colors } = useTheme();
  const { deleteWater, logWater } = useNutritionStore();
  const [busyId, setBusyId] = useState<string | null>(null);

  const remove = async (entry: WaterIntakeView) => {
    if (busyId) return;
    setBusyId(entry.id);
    try {
      const removed = await deleteWater(entry.id);
      showToast({
        message: `${removed.amountMl} ml removed`,
        actionLabel: 'Undo',
        onAction: () => {
          // Same id, same time, same day: logging is idempotent per id, so this is exactly the entry back.
          void logWater(removed.amountMl, {
            id: removed.id,
            date: removed.date,
            loggedAt: removed.loggedAt,
          }).catch(() =>
            showToast({ tone: 'error', message: 'Could not restore the water entry.' }),
          );
        },
      });
    } catch {
      showToast({ tone: 'error', message: 'Could not delete this entry. Please try again.' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <BottomSheet
      visible={open}
      onClose={onClose}
      title="Water log"
      description="Delete an entry you added by mistake."
    >
      <View style={styles.list}>
        {entries.length === 0 ? (
          <Text style={[premium.type.body, { color: colors.muted }]}>
            No water logged for this day.
          </Text>
        ) : (
          entries.map((entry) => (
            <View key={entry.id} style={[styles.row, { borderBottomColor: colors.line }]}>
              <View style={styles.copy}>
                <Text style={[premium.type.label, { color: colors.ink }]}>{entry.amountMl} ml</Text>
                <Text style={[premium.type.caption, { color: colors.muted }]}>
                  {new Date(entry.loggedAt).toLocaleTimeString([], {
                    hour: 'numeric',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Delete ${entry.amountMl} ml water entry`}
                disabled={busyId !== null}
                hitSlop={8}
                onPress={() => {
                  void remove(entry);
                }}
                style={({ pressed }) => [
                  styles.deleteButton,
                  {
                    backgroundColor: colors.surface2,
                    opacity: pressed || busyId !== null ? 0.6 : 1,
                  },
                ]}
              >
                <Trash2 size={18} color={colors.ink} />
              </Pressable>
            </View>
          ))
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 20, paddingBottom: 24 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  copy: { flex: 1, gap: 2 },
  deleteButton: {
    width: premium.layout.touch,
    height: premium.layout.touch,
    borderRadius: premium.layout.touch / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
