import type { ChartPoint, TimeRange } from '../../../shared/types/health';

export type MetricKey = 'weight' | 'calories' | 'sleep' | 'protein' | 'workouts' | 'recovery' | 'steps' | 'water';

const days = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const weeks = ['W33', 'W34', 'W35', 'W36', 'W37', 'W38', 'W39', 'W40'];
const months = ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
const years = ['2024', '2025', '2026'];

const zip = (labels: string[], values: number[]): ChartPoint[] => labels.map((label, i) => ({ label, value: values[i] ?? 0 }));

export const progressMetrics: Record<
  MetricKey,
  {label: string;unit: string;chart: 'line' | 'bar';lowerIsBetter?: boolean;requiresDevice?: boolean;series: Record<TimeRange, ChartPoint[]>;goal?: number;}> =
{
  weight: {
    label: 'Weight', unit: 'kg', chart: 'line', lowerIsBetter: true,
    series: {
      D: zip(days, [79.0, 78.8, 78.9, 78.6, 78.7, 78.5, 78.4]),
      W: zip(weeks, [80.6, 80.3, 80.1, 79.7, 79.4, 79.0, 78.7, 78.4]),
      M: zip(months, [81.8, 81.9, 81.0, 80.4, 79.2, 78.4]),
      Y: zip(years, [86.1, 84.9, 78.4])
    },
    goal: 75
  },
  calories: {
    label: 'Calories', unit: 'kcal', chart: 'bar',
    series: {
      D: zip(days, [2710, 2860, 2290, 2140, 2480, 2210, 420]),
      W: zip(weeks, [2510, 2460, 2390, 2420, 2350, 2330, 2410, 2380]),
      M: zip(months, [2480, 2510, 2440, 2410, 2370, 2380]),
      Y: zip(years, [2620, 2540, 2410])
    },
    goal: 2350
  },
  sleep: {
    label: 'Sleep', unit: 'h', chart: 'bar', requiresDevice: true,
    series: {
      D: zip(days, [8.0, 7.6, 7.0, 7.2, 6.5, 7.3, 7.75]),
      W: zip(weeks, [6.8, 6.9, 7.0, 6.9, 7.1, 7.2, 7.1, 7.35]),
      M: zip(months, [6.7, 6.8, 6.9, 6.97, 7.2, 7.3]),
      Y: zip(years, [6.6, 6.8, 7.1])
    },
    goal: 7.5
  },
  protein: {
    label: 'Protein', unit: 'g', chart: 'bar',
    series: {
      D: zip(days, [112, 98, 104, 146, 121, 132, 25]),
      W: zip(weeks, [104, 108, 112, 110, 118, 121, 124, 118]),
      M: zip(months, [98, 104, 109, 112, 124, 118]),
      Y: zip(years, [86, 101, 116])
    },
    goal: 150
  },
  workouts: {
    label: 'Workouts', unit: 'sessions', chart: 'bar',
    series: {
      D: zip(days, [1, 0, 1, 1, 0, 1, 0]),
      W: zip(weeks, [3, 4, 4, 3, 5, 4, 5, 4]),
      M: zip(months, [12, 13, 14, 16, 19, 5]),
      Y: zip(years, [96, 142, 168])
    }
  },
  recovery: {
    label: 'Recovery', unit: '', chart: 'line', requiresDevice: true,
    series: {
      D: zip(days, [78, 81, 70, 66, 58, 74, 84]),
      W: zip(weeks, [63, 65, 66, 64, 70, 72, 71, 73]),
      M: zip(months, [62, 64, 65, 66, 71, 73]),
      Y: zip(years, [0, 61, 68])
    }
  },
  steps: {
    label: 'Steps', unit: 'steps', chart: 'bar',
    series: {
      D: zip(days, [11240, 7310, 8420, 9870, 6120, 10450, 2180]),
      W: zip(weeks, [8210, 8640, 9010, 8870, 9240, 8940, 9120, 8830]),
      M: zip(months, [7820, 8340, 8610, 9120, 8940, 7941]),
      Y: zip(years, [6900, 8120, 8790])
    },
    goal: 10000
  },
  water: {
    label: 'Water',
    unit: 'ml',
    chart: 'bar',
    series: {
      D: [],
      W: [],
      M: [],
      Y: [],
    },
    goal: 3000,
  }
};

export const rangeLabels: Record<TimeRange, string> = {
  D: 'Last 7 days',
  W: 'Last 8 weeks',
  M: 'Last 6 months',
  Y: 'Since 2024'
};

export const achievements = [
{ title: 'Bench PR', detail: '72.5 kg × 6 · Oct 5', earned: true },
{ title: '5K under 30', detail: '28:40 · Sep 12', earned: true },
{ title: '19-workout month', detail: 'September', earned: true },
{ title: '10 kg down', detail: '5.8 of 10 kg', earned: false }];