import { premium } from '@/shared/theme/premium';
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { BottomSheet } from '../../../shared/components/ui/BottomSheet';
import { Button } from '../../../shared/components/ui/Button';
import { showToast } from '../../../shared/stores/toastStore';
import type { RejectedNutritionLog } from '../services/nutrition-offline-sync';
import { useNutritionStore } from '../store/nutritionStore';
import { describeRejectedEntry } from '../utils/rejected-entry';
import { useTheme } from '@/hooks/use-theme';

type RejectedEntriesSheetProps = {
  open: boolean;
  entries: RejectedNutritionLog[];
  onClose: () => void;
};

/** Entries the server refused. Each can be tried again or dismissed; nothing disappears without the member seeing it. */
export function RejectedEntriesSheet({ open, entries, onClose }: RejectedEntriesSheetProps) {
  const { colors } = useTheme();
  const { dismissRejectedEntry, retryRejectedEntry } = useNutritionStore();
  const [busyId, setBusyId] = useState<string | null>(null);

  const run = async (entry: RejectedNutritionLog, action: 'retry' | 'dismiss') => {
    if (busyId) return;
    setBusyId(entry.id);
    try {
      if (action === 'retry') await retryRejectedEntry(entry.kind, entry.id);
      else await dismissRejectedEntry(entry.kind, entry.id);
    } catch {
      showToast({ tone: 'error', message: 'Something went wrong. Please try again.' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <BottomSheet
      visible={open}
      onClose={onClose}
      title="Entries that couldn’t be saved"
      description="The server turned these down. You can try again or remove them."
    >
      <View style={styles.list}>
        {entries.length === 0 ? (
          <Text style={[premium.type.body, { color: colors.muted }]}>Nothing to review.</Text>
        ) : (
          entries.map((entry) => (
            <View
              key={`${entry.kind}:${entry.id}`}
              style={[styles.row, { borderBottomColor: colors.line }]}
            >
              <Text style={[premium.type.label, { color: colors.ink }]}>
                {describeRejectedEntry(entry)}
              </Text>
              <Text style={[premium.type.caption, { color: colors.muted }]}>{entry.reason}</Text>
              <View style={styles.actions}>
                <Button
                  title="Try again"
                  size="sm"
                  variant="secondary"
                  disabled={busyId !== null}
                  loading={busyId === entry.id}
                  onPress={() => {
                    void run(entry, 'retry');
                  }}
                />
                <Button
                  title="Remove"
                  size="sm"
                  variant="ghost"
                  disabled={busyId !== null}
                  onPress={() => {
                    void run(entry, 'dismiss');
                  }}
                />
              </View>
            </View>
          ))
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 20, paddingBottom: 24 },
  row: { gap: 4, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  actions: { flexDirection: 'row', gap: 8, marginTop: 8 },
});
