import type { MetricKey } from '@/features/progress/types/progress';
import type { TimeRange } from '@/shared/types/health';
export type { MetricKey };
export const progressMetrics: Record<
  MetricKey,
  {
    label: string;
    unit: string;
    chart: 'line' | 'bar';
    lowerIsBetter?: boolean;
    requiresDevice?: boolean;
    goal?: number;
  }
> = {
  weight: { label: 'Weight', unit: 'kg', chart: 'line', lowerIsBetter: true },
  calories: { label: 'Calories', unit: 'kcal', chart: 'bar' },
  sleep: { label: 'Sleep', unit: 'h', chart: 'bar', requiresDevice: true },
  protein: { label: 'Protein', unit: 'g', chart: 'bar' },
  workouts: { label: 'Workouts', unit: 'sessions', chart: 'bar' },
  recovery: { label: 'Recovery', unit: '', chart: 'line', requiresDevice: true },
  steps: { label: 'Steps', unit: 'steps', chart: 'bar', requiresDevice: true },
  water: { label: 'Water', unit: 'ml', chart: 'bar' },
};
export const rangeLabels: Record<TimeRange, string> = {
  D: 'Last 7 days',
  W: 'Last 8 weeks',
  M: 'Last 6 months',
  Y: 'Last 3 years',
};
