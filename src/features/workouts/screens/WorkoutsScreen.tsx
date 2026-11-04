import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import {
  BookOpen,
  BarChart3,
  Check,
  ChevronRight,
  History,
  Play,
  Sparkles,
  Trophy,
  X,
} from 'lucide-react-native';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { IconButton } from '../../../shared/components/ui/IconButton';
import { Button } from '../../../shared/components/ui/Button';
import { SectionHeader } from '../../../shared/components/ui/SectionHeader';
import { ListGroup, ListRow } from '../../../shared/components/ui/ListRow';
import { ProgressBar } from '../../../shared/components/ui/ProgressBar';
import { BottomSheet } from '../../../shared/components/ui/BottomSheet';
import { BarChart } from '../../../shared/components/charts/BarChart';
import { showToast } from '../../../shared/stores/toastStore';
import { program, weekSchedule, weeklyVolume, workoutCategories } from '../data/workoutsMock';
import { useWorkoutStore } from '../store/workoutStore';
import { useTheme } from '@/hooks/use-theme';

export function WorkoutsScreen() {
  const { colors } = useTheme();
  const { navigate } = useNavigation();
  const { plannedSession, todayStatus } = useWorkoutStore();
  const [category, setCategory] = useState<(typeof workoutCategories)[number] | null>(null);

  return (
    <Screen
      title="Workouts"
      showBack={false}
      headerRight={
        <IconButton
          icon={History}
          label="Workout history"
          onPress={() => navigate('workoutHistory')}
        />
      }
    >
      <View style={styles.content}>
        {/* Week Schedule Strip */}
        <View style={styles.scheduleRow}>
          {weekSchedule.map((d) => {
            const isToday = d.status === 'today';
            return (
              <View
                key={d.date}
                style={[
                  styles.dayCard,
                  {
                    backgroundColor: isToday ? colors.ink : colors.surface,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.dayLabel,
                    { color: isToday ? colors.bg : colors.muted },
                  ]}
                >
                  {d.day}
                </Text>
                <Text
                  style={[
                    styles.dayDate,
                    { color: isToday ? colors.bg : colors.ink },
                  ]}
                >
                  {d.date}
                </Text>
                <View style={styles.dayStatusWrap}>
                  {d.status === 'done' && <Check size={14} color={colors.good} />}
                  {d.status === 'missed' && <X size={14} color={colors.bad} />}
                  {d.status === 'rest' && (
                    <Text style={[styles.restText, { color: colors.muted }]}>
                      Rest
                    </Text>
                  )}
                  {d.status === 'today' && (
                    <View
                      style={[
                        styles.todayDot,
                        {
                          backgroundColor:
                            todayStatus === 'completed' ? colors.good : colors.accent,
                        },
                      ]}
                    />
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {/* Today's Session Card */}
        <View
          style={[
            styles.todayCard,
            {
              backgroundColor: colors.surface,
              borderColor: colors.line,
            },
          ]}
        >
          <Text style={[styles.focusLabel, { color: colors.muted }]}>
            {plannedSession.focus}
          </Text>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => navigate('workoutPlan')}
            style={styles.sessionTitleBtn}
          >
            <Text style={[styles.sessionTitle, { color: colors.ink }]}>
              {plannedSession.title}
            </Text>
            <ChevronRight size={20} color={colors.muted} />
          </TouchableOpacity>
          <Text style={[styles.sessionMeta, { color: colors.muted }]}>
            {plannedSession.durationMin} min · {plannedSession.exercises.length}{' '}
            exercises · {plannedSession.intensity}
          </Text>
          <Button
            size="lg"
            fullWidth
            icon={Play}
            disabled={todayStatus === 'completed'}
            onPress={() => navigate('activeWorkout')}
            style={{ marginTop: 16 }}
            title={
              todayStatus === 'completed'
                ? 'Completed today'
                : todayStatus === 'inProgress'
                ? 'Resume workout'
                : 'Start workout'
            }
          />
        </View>

        {/* Current Program */}
        <View style={styles.section}>
          <SectionHeader title="Current program" />
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderColor: colors.line,
              },
            ]}
          >
            <Text style={[styles.progName, { color: colors.ink }]}>
              {program.name}
            </Text>
            <Text style={[styles.progMeta, { color: colors.muted }]}>
              Week {program.week} of {program.totalWeeks} · {program.sessionsDone}/
              {program.sessionsTotal} sessions
            </Text>
            <ProgressBar
              value={program.sessionsDone}
              max={program.sessionsTotal}
              color={colors.accent}
              height={8}
              style={{ marginTop: 12 }}
            />
          </View>
        </View>

        {/* AI Plan Generator CTA Card */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => navigate('workoutGenerator')}
          style={[
            styles.aiCard,
            { backgroundColor: colors.hero },
          ]}
        >
          <View
            style={[
              styles.aiIconWrap,
              { backgroundColor: colors.accent },
            ]}
          >
            <Sparkles size={20} color={colors.accentInk} />
          </View>
          <View style={styles.aiTextCol}>
            <Text style={[styles.aiTitle, { color: colors.heroInk }]}>
              Generate a plan with AI
            </Text>
            <Text style={[styles.aiDesc, { color: colors.heroMuted }]}>
              Uses your goal, equipment and today’s recovery
            </Text>
          </View>
          <ChevronRight size={18} color={colors.heroMuted} />
        </TouchableOpacity>

        {/* Browse Plans / Categories */}
        <View style={styles.section}>
          <SectionHeader title="Browse plans" />
          <ListGroup>
            {workoutCategories.map((c) => (
              <ListRow
                key={c.name}
                title={c.name}
                subtitle={c.detail}
                value={`${c.plans}`}
                onPress={() => setCategory(c)}
              />
            ))}
          </ListGroup>
        </View>

        {/* Weekly Volume */}
        <View style={styles.section}>
          <SectionHeader
            title="Weekly volume"
            actionLabel="Analytics"
            onAction={() => navigate('workoutAnalytics')}
          />
          <View
            style={[
              styles.card,
              {
                backgroundColor: colors.surface,
                borderColor: colors.line,
              },
            ]}
          >
            <BarChart
              data={weeklyVolume}
              formatValue={(v) => `${v.toLocaleString()} kg`}
              barColor={colors.accent}
              height={110}
            />
          </View>
        </View>

        {/* Links to Library, History, Records, Analytics */}
        <ListGroup>
          <ListRow
            icon={BookOpen}
            title="Exercise library"
            subtitle="Search 14 exercises with form cues"
            onPress={() => navigate('exerciseLibrary')}
          />
          <ListRow
            icon={History}
            title="Workout history"
            subtitle="Calendar and past sessions"
            onPress={() => navigate('workoutHistory')}
          />
          <ListRow
            icon={Trophy}
            title="Personal records"
            subtitle="5 lifts tracked"
            onPress={() => navigate('personalRecords')}
          />
          <ListRow
            icon={BarChart3}
            title="Workout analytics"
            subtitle="Frequency, volume, muscle balance, strength"
            onPress={() => navigate('workoutAnalytics')}
          />
        </ListGroup>
      </View>

      {/* Plan Category Detail Sheet */}
      <BottomSheet
        visible={Boolean(category)}
        onClose={() => setCategory(null)}
        title={category?.name || ''}
        description={category?.detail}
      >
        <View style={styles.plansSheetBody}>
          {['Beginner · 4 weeks', 'Intermediate · 8 weeks', 'Advanced · 12 weeks']
            .slice(0, Math.min(3, category?.plans ?? 1))
            .map((p) => (
              <View
                key={p}
                style={[
                  styles.planSheetItem,
                  { borderColor: colors.line },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.sheetPlanName, { color: colors.ink }]}>
                    {category?.name}
                  </Text>
                  <Text style={[styles.sheetPlanDetail, { color: colors.muted }]}>
                    {p}
                  </Text>
                </View>
                <Button
                  size="sm"
                  variant="secondary"
                  title="Save"
                  onPress={() => {
                    setCategory(null);
                    showToast({
                      message: `${category?.name} saved to your plans`,
                    });
                  }}
                />
              </View>
            ))}
        </View>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 16,
    gap: 24,
    paddingBottom: 32,
  },
  scheduleRow: {
    flexDirection: 'row',
    gap: 6,
  },
  dayCard: {
    flex: 1,
    alignItems: 'center',
    borderRadius: 16,
    paddingVertical: 10,
  },
  dayLabel: {
    fontSize: 11,
  },
  dayDate: {
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  dayStatusWrap: {
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  restText: {
    fontSize: 10,
  },
  todayDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  todayCard: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
  },
  focusLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  sessionTitleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  sessionTitle: {
    fontSize: 24,
    fontWeight: '600',
    letterSpacing: -0.3,
  },
  sessionMeta: {
    fontSize: 13,
    marginTop: 4,
  },
  section: {},
  card: {
    borderRadius: 24,
    borderWidth: 1,
    padding: 20,
  },
  progName: {
    fontSize: 16,
    fontWeight: '600',
  },
  progMeta: {
    fontSize: 13,
    marginTop: 2,
  },
  aiCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 24,
    padding: 20,
    gap: 16,
  },
  aiIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiTextCol: {
    flex: 1,
  },
  aiTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  aiDesc: {
    fontSize: 13,
    marginTop: 2,
  },
  plansSheetBody: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 10,
  },
  planSheetItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  sheetPlanName: {
    fontSize: 15,
    fontWeight: '600',
  },
  sheetPlanDetail: {
    fontSize: 13,
    marginTop: 2,
  },
});
