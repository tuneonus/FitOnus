import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useNavigation, useRouteParams } from '@/app/navigation/NavigationContext';
import { Screen } from '@/shared/components/ui/Screen';
import { Button } from '@/shared/components/ui/Button';
import { Stepper } from '@/shared/components/ui/Stepper';
import { Chip } from '@/shared/components/ui/Chip';
import { TextField } from '@/shared/components/ui/TextField';
import { showToast } from '@/shared/stores/toastStore';
import { useGoalsStore } from '../store/goalsStore';
import { goalTypeMeta } from '../constants/goalTypes';
import { useTheme } from '@/hooks/use-theme';
import type { GoalType } from '../types/goal';

const deadlines = ['4 weeks', '8 weeks', '12 weeks', 'Ongoing'];
const baseline: Partial<Record<GoalType, number>> = {
  weightLoss: 78.4,
  maintain: 78.4,
  muscleGain: 35.2,
  run5k: 28.7,
  run10k: 62,
  marathon: 5,
};

export function GoalCreateScreen() {
  const { colors } = useTheme();
  const params = useRouteParams<{ id?: string }>();
  const id = params.id;
  const { goBack, replace } = useNavigation();
  const { goals, addGoal, updateGoal } = useGoalsStore();
  const editing = goals.find((g) => g.id === id);

  const [type, setType] = useState<GoalType>(editing?.type ?? 'weightLoss');
  const meta = goalTypeMeta[type];
  const [target, setTarget] = useState(editing?.target ?? meta.defaultTarget);
  const [deadline, setDeadline] = useState(editing ? 'Ongoing' : '12 weeks');
  const [title, setTitle] = useState(editing?.title ?? '');
  const [saving, setSaving] = useState(false);

  const pick = (t: GoalType) => {
    setType(t);
    setTarget(goalTypeMeta[t].defaultTarget);
  };

  const autoTitle = `${meta.label} · ${target.toFixed(meta.decimals)} ${meta.unit}`;

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      if (editing) {
        await updateGoal(editing.id, { targetValue: target, title: title || editing.title });
        showToast({ message: 'Goal updated' });
        goBack();
        return;
      }
      const start = baseline[type] ?? 0;
      const newId = await addGoal({
        type,
        title: title || autoTitle,
        unit: meta.unit,
        start,
        current: meta.cadence === 'once' ? start : 0,
        target,
        deadline: deadline === 'Ongoing' ? 'Ongoing' : `In ${deadline}`,
        status: 'active',
        cadence: meta.cadence,
        history: meta.cadence === 'once' ? [start] : [0],
        hitDays: meta.cadence === 'daily' ? 0 : undefined,
      });
      showToast({ message: 'Goal created. Your coach will plan around it.' });
      replace('goalDetail', { id: newId });
    } catch {
      showToast({ message: 'Failed to save goal. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      title={editing ? 'Edit goal' : 'New goal'}
      keyboardAvoiding
      footer={
        <Button size="lg" fullWidth onPress={save} loading={saving}>
          {editing ? 'Save changes' : 'Create goal'}
        </Button>
      }
      contentContainerStyle={styles.container}
    >
      {!editing && (
          <View style={styles.sectionBlock}>
            <Text style={[styles.sectionLabel, { color: colors.muted }]}>
              What are you working toward?
            </Text>
            <View style={styles.typeGrid}>
              {(Object.keys(goalTypeMeta) as GoalType[]).map((t) => {
                const m = goalTypeMeta[t];
                const Icon = m.icon;
                const on = t === type;
                return (
                  <TouchableOpacity
                    key={t}
                    activeOpacity={0.7}
                    onPress={() => pick(t)}
                    style={[
                      styles.typeCard,
                      {
                        backgroundColor: colors.surface,
                        borderColor: on ? colors.ink : colors.line,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.typeIconBox,
                        {
                          backgroundColor: on ? colors.accent : colors.surface2,
                        },
                      ]}
                    >
                      <Icon size={16} color={colors.ink} />
                    </View>
                    <Text style={[styles.typeText, { color: colors.ink }]} numberOfLines={1}>
                      {m.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        )}

        {/* Target Stepper */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text style={[styles.cardLabel, { color: colors.muted }]}>
            {meta.cadence === 'daily'
              ? 'Daily target'
              : meta.cadence === 'streak'
              ? 'Streak length'
              : 'Target'}
          </Text>
          <View style={{ marginTop: 12 }}>
            <Stepper
              size="lg"
              label="Target"
              value={target}
              onChange={setTarget}
              step={meta.step}
              decimals={meta.decimals}
              unit={meta.unit}
              max={100000}
            />
          </View>
          {baseline[type] !== undefined && meta.cadence === 'once' && (
            <Text style={[styles.baselineFootnote, { color: colors.muted }]}>
              Current: {baseline[type]} {meta.unit}
            </Text>
          )}
        </View>

        {/* Timeframe */}
        {!editing && meta.cadence === 'once' && (
          <View style={styles.sectionBlock}>
            <Text style={[styles.sectionLabel, { color: colors.muted }]}>Timeframe</Text>
            <View style={styles.deadlinesRow}>
              {deadlines.map((d) => (
                <Chip
                  key={d}
                  label={d}
                  selected={d === deadline}
                  onPress={() => setDeadline(d)}
                />
              ))}
            </View>
            {type === 'weightLoss' && deadline !== 'Ongoing' && (
              <Text style={[styles.rateNote, { color: colors.muted }]}>
                That’s about {((78.4 - target) / parseInt(deadline, 10)).toFixed(2)} kg/week.{' '}
                {(78.4 - target) / parseInt(deadline, 10) > 0.75
                  ? 'Faster than the 0.5–0.75 kg/week most coaches recommend.'
                  : 'A sustainable pace.'}
              </Text>
            )}
          </View>
        )}

        {/* Optional Name */}
        <View style={{ marginTop: 4 }}>
          <TextField
            label="Name (optional)"
            placeholder={autoTitle}
            value={title}
            onChangeText={setTitle}
          />
        </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingBottom: 24,
    gap: 16,
  },
  sectionBlock: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '500',
    paddingHorizontal: 4,
  },
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeCard: {
    width: '48.5%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 12,
  },
  typeIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeText: {
    fontSize: 14,
    fontWeight: '500',
    flex: 1,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
  },
  cardLabel: {
    fontSize: 13,
  },
  baselineFootnote: {
    marginTop: 12,
    fontSize: 12.5,
    textAlign: 'center',
  },
  deadlinesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 4,
  },
  rateNote: {
    fontSize: 12.5,
    lineHeight: 17,
    marginTop: 8,
    paddingHorizontal: 4,
  },
});

