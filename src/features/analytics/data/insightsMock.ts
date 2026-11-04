import type { ChartPoint } from '../../../shared/types/health';

export type AiInsight = {
  id: string;
  kind: 'plateau' | 'overtraining' | 'recovery' | 'sleep' | 'consistency' | 'weekend' | 'workoutWin' | 'nutritionWin' | 'prediction';
  severity: 'positive' | 'watch' | 'info';
  title: string;
  explanation: string;
  evidence: string[];
  series?: ChartPoint[];
  action: string;
  question: string;
  confidence: 'low' | 'medium' | 'high';
  requiresDevice?: boolean;
};

export const aiInsights: AiInsight[] = [
{
  id: 'i1', kind: 'weekend', severity: 'watch', title: 'High-calorie weekends',
  explanation: 'Saturdays and Sundays average 590 kcal more than weekdays, offsetting about half of your weekly deficit.',
  evidence: ['Weekday avg 2,190 kcal', 'Weekend avg 2,780 kcal', '4 of last 4 weekends'],
  series: [{ label: 'Mon', value: 2290 }, { label: 'Tue', value: 2140 }, { label: 'Wed', value: 2480 }, { label: 'Thu', value: 2210 }, { label: 'Fri', value: 2160 }, { label: 'Sat', value: 2710 }, { label: 'Sun', value: 2860 }],
  action: 'Plan my weekend meals', question: 'Why has my weight stopped changing?', confidence: 'high'
},
{
  id: 'i2', kind: 'plateau', severity: 'watch', title: 'Weight loss is slowing',
  explanation: 'Down 0.4 kg in the last 10 days vs 0.9 kg the 10 days before. Not a plateau yet — it would need 2+ flat weeks.',
  evidence: ['10-day change −0.4 kg', 'Prior 10 days −0.9 kg'],
  action: 'Ask why', question: 'Why has my weight stopped changing?', confidence: 'medium'
},
{
  id: 'i3', kind: 'workoutWin', severity: 'positive', title: 'Pressing strength up 11%',
  explanation: 'Bench top set rose 65 → 72.5 kg over 6 weeks while bodyweight dropped — strong sign of muscle retention.',
  evidence: ['Bench +7.5 kg', 'Bodyweight −1.6 kg'],
  action: 'See records', question: 'Show my progress since January', confidence: 'high'
},
{
  id: 'i4', kind: 'sleep', severity: 'info', title: 'Bedtime drifts mid-week', requiresDevice: true,
  explanation: 'Wednesday bedtimes are 40 min later on average, and Thursday recovery scores follow them down.',
  evidence: ['Wed avg bedtime 12:04 AM', 'Thu recovery avg 66'],
  action: 'Ask about sleep', question: 'Why is my recovery lower this week?', confidence: 'medium'
},
{
  id: 'i5', kind: 'overtraining', severity: 'info', title: 'No overtraining signs', requiresDevice: true,
  explanation: 'HRV and resting HR are within your normal range despite 5 sessions/week. Watch for HRV dropping 3+ days in a row.',
  evidence: ['HRV 7-day avg 64 ms (baseline 61)', 'RHR 7-day avg 53 bpm'],
  action: 'Ask coach', question: 'Why is my resting heart rate increasing?', confidence: 'medium'
}];