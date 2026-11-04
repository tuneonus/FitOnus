export const weeklyReport = {
  period: 'Sep 27 – Oct 3',
  generated: 'Sunday, Oct 4 · 9:00 AM',
  headline: 'Strong training week, protein still the gap',
  stats: [
  { label: 'Weight', value: '−0.4', unit: 'kg', note: '79.0 → 78.6', good: true },
  { label: 'Workouts', value: '5', unit: '/5', note: '4h 38m total', good: true },
  { label: 'Avg calories', value: '2,410', unit: 'kcal', note: 'Goal 2,350', good: false },
  { label: 'Avg sleep', value: '7h 21m', unit: '', note: '+14m vs prior', good: true },
  { label: 'Avg protein', value: '118', unit: 'g', note: 'Goal 150', good: false },
  { label: 'Avg recovery', value: '72', unit: '', note: '+5 vs prior', good: true }],

  calories: [
  { label: 'Sun', value: 2480 }, { label: 'Mon', value: 2210 }, { label: 'Tue', value: 2190 }, { label: 'Wed', value: 2260 },
  { label: 'Thu', value: 2240 }, { label: 'Fri', value: 2320 }, { label: 'Sat', value: 3150 }],

  workouts: [
  { day: 'Sun', title: 'Rest' }, { day: 'Mon', title: 'Push' }, { day: 'Tue', title: 'Pull' }, { day: 'Wed', title: 'Legs' },
  { day: 'Thu', title: '5K run' }, { day: 'Fri', title: 'Upper' }, { day: 'Sat', title: 'Legs' }],

  achievements: ['5K in 31:02 — fastest since August', 'Barbell row 67.5 kg × 8 (PR)', '5/5 planned workouts completed'],
  improvements: [
  'Protein hit target on only 1 of 7 days. Add a post-workout shake (+27 g).',
  'Saturday was 800 kcal over — dinner out. Pre-plan one restaurant meal.',
  'Wednesday bedtime 12:05 AM pulled Thursday recovery to 67.'],

  nextGoals: ['Hit 150 g protein on 4+ days', 'Keep bedtime before 11:30 PM on weeknights', 'Bench 72.5 kg × 4 sets of 6']
};

export const monthlyReport = {
  month: 'September 2026',
  generated: 'Oct 1 · 9:00 AM',
  headline: 'Your most consistent month this year',
  stats: [
  { label: 'Weight change', value: '−1.2', unit: 'kg' },
  { label: 'Workouts', value: '19', unit: '' },
  { label: 'Calories burned', value: '11,840', unit: 'active kcal' },
  { label: 'Avg sleep', value: '7h 12m', unit: '' },
  { label: 'Avg recovery', value: '71', unit: '' },
  { label: 'Avg steps', value: '8,940', unit: '' }],

  weightTrend: [
  { label: 'Apr', value: 82.1 }, { label: 'May', value: 81.8 }, { label: 'Jun', value: 81.9 }, { label: 'Jul', value: 81.0 }, { label: 'Aug', value: 80.4 }, { label: 'Sep', value: 79.2 }],

  recoveryTrend: [
  { label: 'Apr', value: 63 }, { label: 'May', value: 62 }, { label: 'Jun', value: 64 }, { label: 'Jul', value: 65 }, { label: 'Aug', value: 66 }, { label: 'Sep', value: 71 }],

  trends: [
  'Weight has dropped 5 of the last 6 months; June was the only flat month (travel).',
  'Recovery rose 5 points as average sleep crossed 7 hours for the first time.',
  'Training volume up 18% vs July with no rise in resting heart rate.'],

  recommendations: [
  { title: 'Raise protein to 150 g', detail: 'You averaged 124 g. Closing the gap protects muscle as you get leaner.' },
  { title: 'Keep 5 sessions, add 1 walk', detail: 'Steps dipped slightly. A 20-min walk on rest days adds ~2,500 steps.' },
  { title: 'Target 74–75 kg by late Dec', detail: 'At −0.4 kg/week you’re ahead of your Jan 31 goal.' }]

};

type WeeklyReport = typeof weeklyReport;
type MonthlyReport = typeof monthlyReport;

const weeklyVariants: Record<string, Partial<WeeklyReport>> = {
  w39: {
    period: 'Sep 20 – 26',
    generated: 'Sunday, Sep 27 · 9:00 AM',
    headline: 'Four sessions, best sleep week so far',
    stats: [
    { label: 'Weight', value: '−0.5', unit: 'kg', note: '79.5 → 79.0', good: true },
    { label: 'Workouts', value: '4', unit: '/5', note: '3h 52m total', good: false },
    { label: 'Avg calories', value: '2,330', unit: 'kcal', note: 'Goal 2,350', good: true },
    { label: 'Avg sleep', value: '7h 07m', unit: '', note: '+22m vs prior', good: true },
    { label: 'Avg protein', value: '121', unit: 'g', note: 'Goal 150', good: false },
    { label: 'Avg recovery', value: '67', unit: '', note: '+2 vs prior', good: true }],

    achievements: ['Lowest weekly weight since March', 'Bedtime before 11:30 PM on 5 nights'],
    improvements: ['Missed Friday’s session — schedule a make-up slot.', 'Protein hit target on 2 of 7 days.']
  },
  w38: {
    period: 'Sep 13 – 19',
    generated: 'Sunday, Sep 20 · 9:00 AM',
    headline: 'Steady week, weekend calories crept up',
    stats: [
    { label: 'Weight', value: '−0.2', unit: 'kg', note: '79.7 → 79.5', good: true },
    { label: 'Workouts', value: '5', unit: '/5', note: '4h 31m total', good: true },
    { label: 'Avg calories', value: '2,470', unit: 'kcal', note: 'Goal 2,350', good: false },
    { label: 'Avg sleep', value: '6h 45m', unit: '', note: '−8m vs prior', good: false },
    { label: 'Avg protein', value: '116', unit: 'g', note: 'Goal 150', good: false },
    { label: 'Avg recovery', value: '65', unit: '', note: '±0 vs prior', good: false }],

    achievements: ['5K in 28:40 — new personal best'],
    improvements: ['Weekend average 2,900 kcal.', 'Sleep under 7h on 4 nights.']
  }
};

const monthlyVariants: Record<string, Partial<MonthlyReport>> = {
  m08: {
    month: 'August 2026',
    generated: 'Sep 1 · 9:00 AM',
    headline: 'Back on track after July travel',
    stats: [
    { label: 'Weight change', value: '−0.6', unit: 'kg' },
    { label: 'Workouts', value: '16', unit: '' },
    { label: 'Calories burned', value: '9,960', unit: 'active kcal' },
    { label: 'Avg sleep', value: '6h 58m', unit: '' },
    { label: 'Avg recovery', value: '66', unit: '' },
    { label: 'Avg steps', value: '9,120', unit: '' }]

  }
};

export const getWeeklyReport = (id?: string): WeeklyReport => ({ ...weeklyReport, ...(id ? weeklyVariants[id] : {}) });
export const getMonthlyReport = (id?: string): MonthlyReport => ({ ...monthlyReport, ...(id ? monthlyVariants[id] : {}) });

export const reportArchive = [
{ id: 'w40', type: 'weekly' as const, title: 'Sep 27 – Oct 3', summary: '5 workouts · −0.4 kg' },
{ id: 'm09', type: 'monthly' as const, title: 'September 2026', summary: '19 workouts · −1.2 kg' },
{ id: 'w39', type: 'weekly' as const, title: 'Sep 20 – 26', summary: '4 workouts · −0.5 kg' },
{ id: 'w38', type: 'weekly' as const, title: 'Sep 13 – 19', summary: '5 workouts · −0.2 kg' },
{ id: 'm08', type: 'monthly' as const, title: 'August 2026', summary: '16 workouts · −0.6 kg' }];