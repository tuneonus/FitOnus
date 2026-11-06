import {
  CupSoda,
  Dumbbell,
  Flame,
  Footprints,
  Award,
  Scale,
  Timer,
  TrendingDown,
  TrendingUp,
  Beef,
} from 'lucide-react-native';
import type { GoalType } from '../types/goal';

export const goalTypeMeta: Record<
  GoalType,
  {
    label: string;
    icon: any;
    unit: string;
    defaultTarget: number;
    cadence: 'once' | 'daily' | 'weekly' | 'streak';
    step: number;
    decimals: number;
  }
> = {
  weightLoss: {
    label: 'Lose weight',
    icon: TrendingDown,
    unit: 'kg',
    defaultTarget: 75,
    cadence: 'once',
    step: 0.5,
    decimals: 1,
  },
  muscleGain: {
    label: 'Gain muscle',
    icon: TrendingUp,
    unit: 'kg lean',
    defaultTarget: 38,
    cadence: 'once',
    step: 0.5,
    decimals: 1,
  },
  maintain: {
    label: 'Maintain weight',
    icon: Scale,
    unit: 'kg',
    defaultTarget: 78,
    cadence: 'once',
    step: 0.5,
    decimals: 1,
  },
  run5k: {
    label: 'Run 5K',
    icon: Footprints,
    unit: 'min',
    defaultTarget: 27,
    cadence: 'once',
    step: 0.5,
    decimals: 1,
  },
  run10k: {
    label: 'Run 10K',
    icon: Timer,
    unit: 'min',
    defaultTarget: 58,
    cadence: 'once',
    step: 1,
    decimals: 0,
  },
  marathon: {
    label: 'Marathon',
    icon: Award,
    unit: 'hrs',
    defaultTarget: 4.5,
    cadence: 'once',
    step: 0.25,
    decimals: 2,
  },
  steps: {
    label: 'Daily steps',
    icon: Footprints,
    unit: 'steps',
    defaultTarget: 10000,
    cadence: 'daily',
    step: 500,
    decimals: 0,
  },
  water: {
    label: 'Water intake',
    icon: CupSoda,
    unit: 'L',
    defaultTarget: 3,
    cadence: 'daily',
    step: 0.25,
    decimals: 2,
  },
  protein: {
    label: 'Protein intake',
    icon: Beef,
    unit: 'g',
    defaultTarget: 150,
    cadence: 'daily',
    step: 5,
    decimals: 0,
  },
  streak: {
    label: 'Workout streak',
    icon: Flame,
    unit: 'days',
    defaultTarget: 7,
    cadence: 'streak',
    step: 1,
    decimals: 0,
  },
  workoutFrequency: {
    label: 'Workout frequency',
    icon: Dumbbell,
    unit: 'sessions',
    defaultTarget: 4,
    cadence: 'weekly',
    step: 1,
    decimals: 0,
  },
  custom: {
    label: 'Custom goal',
    icon: Award,
    unit: 'units',
    defaultTarget: 10,
    cadence: 'once',
    step: 1,
    decimals: 0,
  },
};

export const strengthIcon = Dumbbell;
