import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { CheckCircle2, Ban, RotateCcw, ShieldCheck } from 'lucide-react-native';
import { useNavigation } from '../../../../app/navigation/NavigationContext';
import { Button } from '../../../../shared/components/ui/Button';
import { showToast } from '../../../../shared/stores/toastStore';
import { executeAction } from '../../services/actionExecutor';
import type { ActionStatus, Block } from '../../types/coach';
import { useTheme } from '@/hooks/use-theme';

type ActionBlockProps = {
  block: Extract<Block, { type: 'action' }>;
  onStatusChange: (status: ActionStatus, resultText?: string) => void;
};

const undoRegistry = new Map<string, () => void>();

export function ActionBlock({ block, onStatusChange }: ActionBlockProps) {
  const { colors } = useTheme();
  const { navigate } = useNavigation();

  const confirm = async () => {
    onStatusChange('running');
    try {
      const result = await executeAction(block.payload);
      if (block.payload.kind === 'startWorkout') {
        onStatusChange('confirmed', 'Workout started');
        navigate('activeWorkout');
        return;
      }
      if (result.undo) undoRegistry.set(block.id, result.undo);
      onStatusChange('confirmed', result.message);
      showToast({
        message: result.message,
        actionLabel: result.undo ? 'Undo' : undefined,
        onAction: result.undo ? () => undo() : undefined,
      });
    } catch (err: any) {
      onStatusChange('cancelled', err?.message || 'Failed to complete action');
    }
  };

  const undo = () => {
    undoRegistry.get(block.id)?.();
    undoRegistry.delete(block.id);
    onStatusChange('undone', 'Undone — nothing was saved');
  };

  const confirmLabel = {
    logMeal: 'Log meal',
    logWorkout: 'Log sets',
    updateWeight: 'Save weight',
    createPlan: 'Use plan',
    updateGoal: 'Update goal',
    startWorkout: 'Start now',
  }[block.payload.kind];

  return (
    <View
      style={[
        styles.container,
        {
          borderColor: colors.ink,
          backgroundColor: colors.surface,
        },
      ]}
    >
      <View
        style={[
          styles.headerBadge,
          {
            backgroundColor: colors.surface2,
            borderBottomColor: colors.line,
          },
        ]}
      >
        <ShieldCheck size={14} color={colors.ink} />
        <Text style={[styles.headerBadgeText, { color: colors.muted }]}>
          Needs your confirmation
        </Text>
      </View>

      <View style={styles.body}>
        <Text style={[styles.title, { color: colors.ink }]}>{block.title}</Text>

        <View style={styles.summaryList}>
          {block.summary.map((s, idx) => (
            <View
              key={s.label}
              style={[
                styles.summaryRow,
                idx > 0 && { borderTopWidth: 1, borderTopColor: colors.line },
              ]}
            >
              <Text style={[styles.summaryLabel, { color: colors.muted }]}>
                {s.label}
              </Text>
              <View style={styles.summaryValueWrap}>
                <Text style={[styles.summaryVal, { color: colors.ink }]}>
                  {s.value}
                </Text>
                {s.estimated && (
                  <View
                    style={[
                      styles.estBadge,
                      { borderColor: colors.muted },
                    ]}
                  >
                    <Text style={[styles.estText, { color: colors.muted }]}>
                      Est.
                    </Text>
                  </View>
                )}
              </View>
            </View>
          ))}
        </View>

        <View style={styles.actionsContainer}>
          {block.status === 'pending' && (
            <View style={styles.pendingBtnRow}>
              <Button
                variant="secondary"
                size="sm"
                title="Cancel"
                style={{ flex: 1 }}
                onPress={() => onStatusChange('cancelled', 'Cancelled')}
              />
              {block.payload.kind === 'logMeal' && (
                <Button
                  variant="outline"
                  size="sm"
                  title="Edit"
                  style={{ flex: 1 }}
                  onPress={() =>
                    navigate('foodSearch', {
                      meal: (block.payload as { meal: string }).meal,
                    })
                  }
                />
              )}
              <Button
                size="sm"
                title={confirmLabel}
                style={{ flex: 1 }}
                onPress={confirm}
              />
            </View>
          )}

          {block.status === 'running' && (
            <View style={styles.statusRow}>
              <ActivityIndicator size="small" color={colors.muted} />
              <Text style={[styles.statusText, { color: colors.muted }]}>
                Saving…
              </Text>
            </View>
          )}

          {block.status === 'confirmed' && (
            <View
              style={[
                styles.resultBanner,
                { backgroundColor: `${colors.good}20` },
              ]}
            >
              <View style={styles.resultLeft}>
                <CheckCircle2 size={16} color={colors.good} />
                <Text style={[styles.confirmedText, { color: colors.good }]}>
                  {block.resultText}
                </Text>
              </View>
              {undoRegistry.has(block.id) && (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={undo}
                  style={styles.undoBtn}
                >
                  <RotateCcw size={13} color={colors.ink} />
                  <Text style={[styles.undoText, { color: colors.ink }]}>Undo</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {(block.status === 'cancelled' || block.status === 'undone') && (
            <View style={styles.statusRow}>
              <Ban size={15} color={colors.muted} />
              <Text style={[styles.statusText, { color: colors.muted }]}>
                {block.resultText}
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 24,
    borderWidth: 2,
    overflow: 'hidden',
    marginTop: 8,
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  headerBadgeText: {
    fontSize: 12,
    fontWeight: '500',
  },
  body: {
    padding: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
  summaryList: {
    marginTop: 10,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  summaryLabel: {
    fontSize: 13.5,
  },
  summaryValueWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  summaryVal: {
    fontSize: 13.5,
    fontWeight: '500',
  },
  estBadge: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  estText: {
    fontSize: 10,
  },
  actionsContainer: {
    marginTop: 12,
  },
  pendingBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  statusText: {
    fontSize: 14,
  },
  resultBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  resultLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  confirmedText: {
    fontSize: 14,
    fontWeight: '600',
  },
  undoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  undoText: {
    fontSize: 13,
    fontWeight: '600',
  },
});

