import { AppError } from '../../../../shared/errors/app-error.js';
import { getZonedDateParts } from '../../domain/calendar-bounds.js';
import type { IProgressTelemetryPort, IWeightRepository } from '../ports.js';

export interface GetProgressReportInput {
  userId: string;
  type: 'weekly' | 'monthly';
  date?: string; // Optional reference date YYYY-MM-DD
  timezone?: string;
}

export interface ProgressReportStat {
  label: string;
  value: string;
  unit: string;
  note?: string;
  good?: boolean;
}

export interface ProgressReportResult {
  period: string;
  generated: string;
  headline: string;
  stats: ProgressReportStat[];
  calories: { label: string; value: number }[];
  workouts: { day: string; title: string }[];
  achievements: string[];
  improvements: string[];
  nextGoals: string[];
}

/** A goal counts as configured only when it is a positive number; null/0/negative means "not set". */
function configuredGoal(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

export class GetProgressReportsUseCase {
  constructor(
    private readonly weightRepo: IWeightRepository,
    private readonly telemetryPort: IProgressTelemetryPort,
  ) {}

  async execute(input: GetProgressReportInput): Promise<ProgressReportResult> {
    if (!input.userId) {
      throw new AppError('unauthorized', 'UNAUTHENTICATED', 'User ID is required');
    }

    const timezone = input.timezone ?? 'UTC';
    const refDate = input.date ? new Date(input.date) : new Date();
    const parts = getZonedDateParts(refDate, timezone);
    const goals = await this.telemetryPort.getProfileGoals(input.userId);

    let periodStart: Date;
    let periodEnd: Date;
    let periodLabel: string;

    if (input.type === 'weekly') {
      // Prior 7 days ending at reference date
      periodEnd = refDate;
      periodStart = new Date(refDate.getTime() - 6 * 24 * 60 * 60 * 1000);
      const startParts = getZonedDateParts(periodStart, timezone);
      periodLabel = `${startParts.monthShort} ${startParts.day} – ${parts.monthShort} ${parts.day}`;
    } else {
      // Prior calendar month
      const prevYear = parts.month === 1 ? parts.year - 1 : parts.year;
      const prevMonth = parts.month === 1 ? 12 : parts.month - 1;
      periodStart = new Date(Date.UTC(prevYear, prevMonth - 1, 1));
      periodEnd = new Date(Date.UTC(parts.year, parts.month - 1, 1, 0, 0, 0, -1));
      const monthName = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'UTC' }).format(
        periodStart,
      );
      periodLabel = `${monthName} ${prevYear}`;
    }

    // 1. Workouts Telemetry
    const sessions = await this.telemetryPort.getWorkoutSessions(input.userId, periodStart, periodEnd);
    const workoutCount = sessions.length;
    const totalDurationMinutes = Math.round(sessions.reduce((acc, s) => acc + s.durationSeconds, 0) / 60);
    const durationHours = Math.floor(totalDurationMinutes / 60);
    const durationRemainderMins = totalDurationMinutes % 60;
    const durationNote = `${durationHours}h ${durationRemainderMins}m total`;

    // 2. Weight Telemetry
    const weightLogs = await this.weightRepo.listForUser(input.userId, {
      startDate: periodStart,
      endDate: periodEnd,
      limit: 100,
    });

    // A weight change needs at least two weigh-ins in the period; with fewer it stays null (shown as "—").
    let weightDelta: number | null = null;
    let weightNote = '';
    let weightGood = true;

    if (weightLogs.logs.length >= 2) {
      const latest = weightLogs.logs[0]!.weightKg;
      const earliest = weightLogs.logs[weightLogs.logs.length - 1]!.weightKg;
      weightDelta = Math.round((latest - earliest) * 10) / 10;
      weightNote = `${earliest.toFixed(1)} → ${latest.toFixed(1)}`;
      weightGood = goals?.primaryGoal === 'gain' ? weightDelta >= 0 : weightDelta <= 0;
    }

    // 3. Nutrition Telemetry
    const startStr = periodStart.toISOString().slice(0, 10);
    const endStr = periodEnd.toISOString().slice(0, 10);
    const nutrition = await this.telemetryPort.getNutritionAggregates(input.userId, startStr, endStr);

    // Goals come only from the user's own profile. A missing goal stays null: nothing below invents a
    // default target, and every goal-dependent line is left out when its goal is not configured.
    const targetWorkouts = configuredGoal(goals?.workoutDaysPerWeek);
    const targetProtein = configuredGoal(goals?.dailyProteinGrams);

    let avgCalories = 0;
    let avgProtein = 0;
    let daysHitProtein = 0;

    if (nutrition.length > 0) {
      const totalCal = nutrition.reduce((acc, n) => acc + n.totalCalories, 0);
      const totalProt = nutrition.reduce((acc, n) => acc + n.totalProteinG, 0);
      avgCalories = Math.round(totalCal / nutrition.length);
      avgProtein = Math.round(totalProt / nutrition.length);

      if (targetProtein !== null) {
        daysHitProtein = nutrition.filter((n) => n.totalProteinG >= targetProtein).length;
      }
    }

    // 4. PRs achieved in period
    const prs = await this.telemetryPort.getPersonalRecords(input.userId);
    const periodPrs = prs.filter((p) => p.achievedAt >= periodStart && p.achievedAt <= periodEnd);

    // 5. Formulate Deterministic Headline & Improvements
    // null = "no target configured", so we cannot say whether it was met.
    const workoutsGood = targetWorkouts !== null ? workoutCount >= targetWorkouts : null;
    const proteinGood = targetProtein !== null ? avgProtein >= targetProtein : null;

    let headline: string;
    if (workoutsGood === true && proteinGood === true) {
      headline = 'Outstanding training and nutrition week!';
    } else if (workoutsGood === true && proteinGood === false) {
      headline = `Strong training week (${workoutCount} sessions), protein still the gap`;
    } else if (workoutsGood === true) {
      headline = `Strong training week (${workoutCount} sessions)`;
    } else if (workoutsGood === false) {
      headline = `Completed ${workoutCount} workouts, let’s aim for ${targetWorkouts} next period`;
    } else if (workoutCount > 0) {
      // No workout target configured: state what was logged rather than judge it.
      headline = `Logged ${workoutCount} ${workoutCount === 1 ? 'workout' : 'workouts'} this period`;
    } else {
      headline = 'No workouts logged this period';
    }

    const achievements: string[] = [];
    for (const pr of periodPrs.slice(0, 3)) {
      achievements.push(`${pr.exerciseName} ${pr.weightKg} kg × ${pr.reps} (PR)`);
    }
    if (targetWorkouts !== null && workoutCount >= targetWorkouts) {
      achievements.push(`${workoutCount}/${targetWorkouts} planned workouts completed`);
    }

    const improvements: string[] = [];
    if (proteinGood === false && nutrition.length > 0) {
      improvements.push(
        `Protein hit target on only ${daysHitProtein} of ${nutrition.length} logged days. Add a post-workout protein source (+25 g).`,
      );
    }
    if (targetWorkouts !== null && workoutsGood === false) {
      improvements.push(
        `Missed ${targetWorkouts - workoutCount} planned workout session(s) — schedule make-up slots.`,
      );
    }
    // Praise only what was actually measured against a configured target.
    if (improvements.length === 0) {
      if (workoutsGood === true && proteinGood === true) {
        improvements.push('Solid consistency across workouts and nutrition. Keep the momentum going!');
      } else if (workoutsGood === true && proteinGood === null) {
        improvements.push('Solid workout consistency. Keep the momentum going!');
      } else if (proteinGood === true && workoutsGood === null) {
        improvements.push('Protein target met. Keep the momentum going!');
      }
    }

    const nextGoals: string[] = [];
    if (targetProtein !== null) nextGoals.push(`Hit ${targetProtein} g protein on 4+ days`);
    if (targetWorkouts !== null) nextGoals.push(`Complete ${targetWorkouts} workouts`);
    if (goals?.targetWeightKg) {
      nextGoals.push(`Progress toward ${goals.targetWeightKg} kg goal weight`);
    }

    // 6. Build Daily Calories & Workouts lists for chart
    const caloriesList = nutrition.map((n) => ({
      label: n.date.slice(5),
      value: n.totalCalories,
    }));

    const workoutsList = sessions.map((s) => ({
      day: new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: timezone }).format(s.startedAt),
      title: s.name,
    }));

    const stats: ProgressReportStat[] = [
      {
        label: 'Weight',
        // "—" (not "0.0") when there are too few weigh-ins to measure a change.
        value:
          weightDelta === null
            ? '—'
            : weightDelta === 0
              ? '0.0'
              : weightDelta > 0
                ? `+${weightDelta.toFixed(1)}`
                : `−${Math.abs(weightDelta).toFixed(1)}`,
        unit: 'kg',
        note: weightNote || undefined,
        good: weightGood,
      },
      {
        label: 'Workouts',
        value: `${workoutCount}`,
        // Show "/N" only against a target the user actually has.
        unit: targetWorkouts !== null ? `/${targetWorkouts}` : '',
        note: durationNote,
        ...(workoutsGood !== null ? { good: workoutsGood } : {}),
      },
      {
        label: 'Avg calories',
        value: avgCalories > 0 ? avgCalories.toLocaleString() : '—',
        unit: 'kcal',
        note: goals?.dailyCalorieTarget ? `Goal ${goals.dailyCalorieTarget.toLocaleString()}` : undefined,
        good: true,
      },
      {
        label: 'Avg protein',
        value: avgProtein > 0 ? `${avgProtein}` : '—',
        unit: 'g',
        note: targetProtein !== null ? `Goal ${targetProtein}` : undefined,
        ...(proteinGood !== null ? { good: proteinGood } : {}),
      },
    ];

    const generated = new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: timezone,
    }).format(refDate);

    return {
      period: periodLabel,
      generated,
      headline,
      stats,
      calories: caloriesList,
      workouts: workoutsList,
      achievements,
      improvements,
      nextGoals,
    };
  }
}
