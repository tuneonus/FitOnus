import type { DataSource } from '../../../shared/types/health';

export type RecoveryInput = {
  key: string;
  label: string;
  value: string;
  baseline: string;
  impact: number; // -1..1
  note: string;
  source: DataSource;
};

export const recoveryInputs: RecoveryInput[] = [
{ key: 'hrv', label: 'Heart rate variability', value: '68 ms', baseline: '61 ms avg', impact: 0.8, note: '12% above your 30-day baseline', source: { kind: 'synced', label: 'Apple Watch · overnight' } },
{ key: 'rhr', label: 'Resting heart rate', value: '52 bpm', baseline: '55 bpm avg', impact: 0.6, note: '3 bpm below baseline', source: { kind: 'synced', label: 'Apple Watch · overnight' } },
{ key: 'sleep', label: 'Sleep', value: '7h 45m', baseline: '7h 07m avg', impact: 0.7, note: 'Score 88, strong deep sleep', source: { kind: 'synced', label: 'Apple Watch · 6:42 AM' } },
{ key: 'strain', label: 'Previous workout', value: 'Upper Body', baseline: '58 min · RPE 7', impact: -0.2, note: 'Moderate load yesterday', source: { kind: 'manual', label: 'FitOnus log' } },
{ key: 'activity', label: 'Activity level', value: '10,450 steps', baseline: 'Yesterday', impact: 0, note: 'Typical daily load', source: { kind: 'synced', label: 'iPhone + Watch' } }];


export const recoveryTrend = [
{ label: 'Sep 26', value: 72 }, { label: 'Sep 27', value: 81 }, { label: 'Sep 28', value: 64 }, { label: 'Sep 29', value: 62 },
{ label: 'Sep 30', value: 70 }, { label: 'Oct 1', value: 67 }, { label: 'Oct 2', value: 75 }, { label: 'Oct 3', value: 78 },
{ label: 'Oct 4', value: 81 }, { label: 'Oct 5', value: 70 }, { label: 'Oct 6', value: 66 }, { label: 'Oct 7', value: 58 },
{ label: 'Oct 8', value: 74 }, { label: 'Oct 9', value: 84 }];


export const recommendationLevels = [
{ key: 'hard', label: 'Train hard', range: '70–100', detail: 'Heavy compounds, PR attempts, high volume.' },
{ key: 'moderate', label: 'Moderate workout', range: '40–69', detail: 'Normal session at ~80% effort, skip max attempts.' },
{ key: 'rest', label: 'Rest day', range: '0–39', detail: 'Walk, mobility, sleep. Training won’t add much today.' }] as
const;