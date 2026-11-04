import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { Check, Circle, TrendingUp, Trophy } from 'lucide-react-native';
import { useNavigation, useRouteParams } from '@/app/navigation/NavigationContext';
import { Screen } from '@/shared/components/ui/Screen';
import { Button } from '@/shared/components/ui/Button';
import { BarChart } from '@/shared/components/charts/BarChart';
import { showToast } from '@/shared/stores/toastStore';
import { getWeeklyReport } from '../data/reportsMock';
import { useTheme } from '@/hooks/use-theme';

export function WeeklyReportScreen() {
  const { colors } = useTheme();
  const params = useRouteParams<{ period?: string; id?: string }>();
  const period = params.period;
  const id = params.id;
  const r = getWeeklyReport(id);
  const { navigate } = useNavigation();
  const [accepted, setAccepted] = useState<string[]>([]);

  return (
    <Screen
      title="Weekly report"
      footer={
        <Button
          size="lg"
          fullWidth
          onPress={() =>
            navigate('coach', {
              q: 'Plan today’s meals with 160g protein under 2200 calories',
            })
          }
        >
          Discuss with coach
        </Button>
      }
    >
      <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
        {/* Header Hero Section */}
        <View style={[styles.heroCard, { backgroundColor: colors.surface2 }]}>
          <Text style={[styles.heroMeta, { color: colors.muted }]}>
            {period ?? r.period} · Generated {r.generated}
          </Text>
          <Text style={[styles.headline, { color: colors.ink }]}>{r.headline}</Text>

          <View style={[styles.statsGrid, { borderTopColor: colors.line }]}>
            {r.stats.map((s) => (
              <View key={s.label} style={styles.statCol}>
                <Text style={[styles.statLabel, { color: colors.muted }]}>{s.label}</Text>
                <View style={styles.statValRow}>
                  <Text style={[styles.statVal, { color: colors.ink }]}>{s.value}</Text>
                  <Text style={[styles.statUnit, { color: colors.muted }]}>{s.unit}</Text>
                </View>
                <Text
                  style={[
                    styles.statNote,
                    { color: s.good ? colors.good : colors.muted },
                  ]}
                >
                  {s.note}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Calories vs Goal */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text style={[styles.cardTitle, { color: colors.ink }]}>Calories vs goal</Text>
          <View style={{ marginTop: 8 }}>
            <BarChart
              data={r.calories}
              goal={2350}
              highlightIndex={6}
              formatValue={(v) => `${v.toLocaleString()} kcal`}
              height={110}
              barColor={colors.ink}
            />
          </View>
        </View>

        {/* Workouts · 5 of 5 */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text style={[styles.cardTitle, { color: colors.ink }]}>Workouts · 5 of 5</Text>
          <View style={styles.workoutsRow}>
            {r.workouts.map((w) => {
              const isRest = w.title === 'Rest';
              return (
                <View key={w.day} style={styles.workoutDayCol}>
                  <View
                    style={[
                      styles.workoutBadge,
                      {
                        backgroundColor: isRest ? colors.surface2 : colors.accent,
                      },
                    ]}
                  >
                    {isRest ? (
                      <Circle size={10} color={colors.muted} />
                    ) : (
                      <Check size={16} color={colors.ink} strokeWidth={3} />
                    )}
                  </View>
                  <Text style={[styles.dayLabel, { color: colors.muted }]}>{w.day}</Text>
                  <Text style={[styles.dayTitle, { color: colors.ink }]} numberOfLines={1}>
                    {w.title}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Achievements */}
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionHeading, { color: colors.ink }]}>Achievements</Text>
          <View style={styles.bulletList}>
            {r.achievements.map((a) => (
              <View key={a} style={styles.bulletRow}>
                <Trophy size={16} color={colors.accent} style={{ marginTop: 2 }} />
                <Text style={[styles.bulletText, { color: colors.ink }]}>{a}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Areas to improve */}
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionHeading, { color: colors.ink }]}>Areas to improve</Text>
          <View style={styles.bulletList}>
            {r.improvements.map((a) => (
              <View key={a} style={styles.bulletRow}>
                <TrendingUp size={16} color={colors.warn} style={{ marginTop: 2 }} />
                <Text style={[styles.bulletText, { color: colors.ink }]}>{a}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Goals for next week */}
        <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.line }]}>
          <Text style={[styles.cardTitle, { color: colors.ink }]}>Goals for next week</Text>
          <View style={styles.nextGoalsList}>
            {r.nextGoals.map((g) => {
              const on = accepted.includes(g);
              return (
                <TouchableOpacity
                  key={g}
                  activeOpacity={0.7}
                  onPress={() => {
                    setAccepted(on ? accepted.filter((x) => x !== g) : [...accepted, g]);
                    if (!on) showToast({ message: 'Added to this week’s focus' });
                  }}
                  style={styles.checkboxRow}
                >
                  <View
                    style={[
                      styles.checkboxBox,
                      {
                        borderColor: on ? colors.ink : colors.line,
                        backgroundColor: on ? colors.ink : 'transparent',
                      },
                    ]}
                  >
                    {on && <Check size={14} color={colors.bg} strokeWidth={3} />}
                  </View>
                  <Text style={[styles.checkboxLabel, { color: colors.ink }]}>{g}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <Text style={[styles.disclaimer, { color: colors.muted }]}>
          Generated from synced and logged data. Sleep and recovery come from Apple Watch; calories from your food logs (some estimated).
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingBottom: 32,
    gap: 16,
  },
  heroCard: {
    borderRadius: 28,
    padding: 20,
    gap: 8,
  },
  heroMeta: {
    fontSize: 12,
  },
  headline: {
    fontSize: 24,
    fontWeight: '700',
    lineHeight: 30,
    letterSpacing: -0.4,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    paddingTop: 16,
    marginTop: 8,
  },
  statCol: {
    gap: 2,
  },
  statLabel: {
    fontSize: 11.5,
  },
  statValRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 2,
  },
  statVal: {
    fontSize: 18,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  statUnit: {
    fontSize: 11,
  },
  statNote: {
    fontSize: 11,
  },
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
  },
  workoutsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
  },
  workoutDayCol: {
    alignItems: 'center',
    width: 40,
    gap: 3,
  },
  workoutBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayLabel: {
    fontSize: 10.5,
  },
  dayTitle: {
    fontSize: 10.5,
  },
  sectionBlock: {
    gap: 8,
    paddingHorizontal: 4,
  },
  sectionHeading: {
    fontSize: 17,
    fontWeight: '600',
  },
  bulletList: {
    gap: 10,
    marginTop: 4,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  bulletText: {
    fontSize: 14.5,
    flex: 1,
    lineHeight: 20,
  },
  nextGoalsList: {
    gap: 6,
    marginTop: 10,
  },
  checkboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  checkboxBox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxLabel: {
    fontSize: 14.5,
    flex: 1,
  },
  disclaimer: {
    fontSize: 11.5,
    lineHeight: 16,
    textAlign: 'center',
    paddingHorizontal: 8,
  },
});

