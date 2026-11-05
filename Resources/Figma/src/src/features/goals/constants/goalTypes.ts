import {
  CupSodaIcon,
  DumbbellIcon,
  FlameIcon,
  FootprintsIcon,
  MedalIcon,
  ScaleIcon,
  TimerIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  BeefIcon } from
'lucide-react';
import type { GoalType } from '../types/goal';

export const goalTypeMeta: Record<
  GoalType,
  {label: string;icon: typeof ScaleIcon;unit: string;defaultTarget: number;cadence: 'once' | 'daily' | 'streak';step: number;decimals: number;}> =
{
  weightLoss: { label: 'Lose weight', icon: TrendingDownIcon, unit: 'kg', defaultTarget: 75, cadence: 'once', step: 0.5, decimals: 1 },
  muscleGain: { label: 'Gain muscle', icon: TrendingUpIcon, unit: 'kg lean', defaultTarget: 38, cadence: 'once', step: 0.5, decimals: 1 },
  maintain: { label: 'Maintain weight', icon: ScaleIcon, unit: 'kg', defaultTarget: 78, cadence: 'once', step: 0.5, decimals: 1 },
  run5k: { label: 'Run 5K', icon: FootprintsIcon, unit: 'min', defaultTarget: 27, cadence: 'once', step: 0.5, decimals: 1 },
  run10k: { label: 'Run 10K', icon: TimerIcon, unit: 'min', defaultTarget: 58, cadence: 'once', step: 1, decimals: 0 },
  marathon: { label: 'Marathon', icon: MedalIcon, unit: 'hrs', defaultTarget: 4.5, cadence: 'once', step: 0.25, decimals: 2 },
  steps: { label: 'Daily steps', icon: FootprintsIcon, unit: 'steps', defaultTarget: 10000, cadence: 'daily', step: 500, decimals: 0 },
  water: { label: 'Water intake', icon: CupSodaIcon, unit: 'L', defaultTarget: 3, cadence: 'daily', step: 0.25, decimals: 2 },
  protein: { label: 'Protein intake', icon: BeefIcon, unit: 'g', defaultTarget: 150, cadence: 'daily', step: 5, decimals: 0 },
  streak: { label: 'Workout streak', icon: FlameIcon, unit: 'days', defaultTarget: 7, cadence: 'streak', step: 1, decimals: 0 }
};

export const strengthIcon = DumbbellIcon;