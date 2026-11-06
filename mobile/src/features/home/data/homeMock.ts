import type { DataSource } from '../../../shared/types/health';

export const homeUser = {
  firstName: 'Aarav',
  initials: 'AM',
  dateLabel: 'Friday, October 9',
  greeting: 'Good morning',
};

export const dailyBrief = {
  updatedAt: '6:45 AM',
  recovery: 84,
  headline: 'Primed to train',
  recommendation: 'Train hard',
  summary:
    'HRV is above your baseline and you slept 7h 45m with solid deep sleep. A heavy push session fits well today.',
};

export const briefDrivers = [
  { label: 'HRV', value: '68', unit: 'ms', delta: '+12% vs avg', positive: true },
  { label: 'Resting HR', value: '52', unit: 'bpm', delta: '−3 vs avg', positive: true },
  { label: 'Sleep', value: '7h 45m', unit: '', delta: 'Score 88', positive: true },
];

export const suggestedQuestions = [
  'Why is my HRV up today?',
  'Can I skip today’s workout?',
  'How many calories do I have left today?',
  'Can I eat biryani tonight?',
];

export const activityRings = [
  {
    key: 'move',
    label: 'Active calories',
    value: 214,
    goal: 650,
    unit: 'kcal',
    color: '#F45430',
  },
  {
    key: 'exercise',
    label: 'Active minutes',
    value: 18,
    goal: 45,
    unit: 'min',
    color: '#5C8000',
  },
  {
    key: 'steps',
    label: 'Steps',
    value: 2180,
    goal: 10000,
    unit: '',
    color: '#0E96DC',
  },
];

export const weeklySteps = [
  { day: 'S', steps: 11240 },
  { day: 'S', steps: 7310 },
  { day: 'M', steps: 8420 },
  { day: 'T', steps: 9870 },
  { day: 'W', steps: 6120 },
  { day: 'T', steps: 10450 },
  { day: 'F', steps: 2180 },
];

export const activityMeta = {
  stepGoal: 10000,
  weeklyAverage: 8830,
  pace: '540 steps ahead of your usual by now',
};

export type BodySignal = {
  key: 'sleep' | 'heart' | 'weight';
  label: string;
  value: string;
  unit?: string;
  meta: string;
  source: DataSource;
  requiresDevice: boolean;
  series?: number[] | undefined;
  stages?: { label: string; share: number; color: string }[] | undefined;
};

export const bodySignals: BodySignal[] = [
  {
    key: 'sleep',
    label: 'Sleep',
    value: '7h 45m',
    meta: 'Score 88 · 1h 32m deep',
    source: { kind: 'synced', label: 'Apple Watch · 6:42 AM' },
    requiresDevice: true,
    stages: [
      { label: 'Deep', share: 20, color: '#6366F1' },
      { label: 'REM', share: 23, color: 'rgba(99, 102, 241, 0.6)' },
      { label: 'Light', share: 52, color: 'rgba(99, 102, 241, 0.25)' },
      { label: 'Awake', share: 5, color: '#D6780A' },
    ],
  },
  {
    key: 'heart',
    label: 'Resting heart rate',
    value: '52',
    unit: 'bpm',
    meta: 'Lowest in 9 days',
    source: { kind: 'synced', label: 'Apple Watch · 6:42 AM' },
    requiresDevice: true,
    series: [56, 55, 57, 54, 55, 53, 54, 53, 52],
  },
];

export const coachInsights = [
  {
    kind: 'nutrition' as const,
    title: 'Protein fell short 4 of the last 7 days',
    body: 'You’re averaging 118 g against a 150 g target. A 30 g shake after today’s session closes most of the gap.',
    action: 'Plan my protein',
    question: 'Plan today’s meals with 160g protein under 2200 calories',
  },
  {
    kind: 'recovery' as const,
    title: 'Plateau alert: Bench press stalled at 92.5 kg',
    body: '3 weeks at the same working weight. Ready to try a 3×5 at 95 kg with longer rest intervals?',
    action: 'Adjust workout',
    question: 'How should I break through my bench press plateau?',
  },
];

