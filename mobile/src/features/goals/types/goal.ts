export type GoalType =
'weightLoss' |
'muscleGain' |
'maintain' |
'run5k' |
'run10k' |
'marathon' |
'steps' |
'water' |
'protein' |
'streak';

export type Goal = {
  id: string;
  type: GoalType;
  title: string;
  unit: string;
  start: number;
  current: number;
  target: number;
  deadline: string;
  status: 'active' | 'completed';
  cadence: 'once' | 'daily' | 'streak';
  history: number[];
  completedOn?: string | undefined;
  /** For daily goals: days hit in the last 7. */
  hitDays?: number | undefined;
};