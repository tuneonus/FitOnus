/**
 * MOCK coach engine. Pattern-matches prototype questions to grounded, data-backed
 * responses. Production will use an LLM with function calling over AiToolContracts.
 */
import type { Block, CoachResponse, MetricItem } from '../types/coach';
import { useHealthStore } from '../../health-integration/store/healthStore';
import { useNutritionStore, sumNutrients } from '../../nutrition/store/nutritionStore';
import { nutritionGoals } from '../../nutrition/constants/meals';
import { foodDatabase } from '../../nutrition/data/foodsMock';
import { useWeightStore } from '../../weight-tracking/store/weightStore';
import { weightByMonth } from '../../weight-tracking/data/weightMock';
import { generatedFatLossSession, exerciseById } from '../../workouts/data/workoutsMock';
import { useMemoryStore } from '../../ai-memory/store/memoryStore';

const watch = { kind: 'synced' as const, label: 'Apple Watch · 6:42 AM' };
let actionCounter = 0;
const actionId = () => `act-${Date.now()}-${++actionCounter}`;

function context() {
  const status = useHealthStore.getState().status;
  const hasDevice = status === 'synced' || status === 'offline' || status === 'error';
  const totals = sumNutrients(useNutritionStore.getState().entries.flatMap((e) => e.items));
  const weights = useWeightStore.getState().entries;
  const memory = useMemoryStore.getState();
  return { hasDevice, totals, weights, memoryOn: memory.enabled };
}

const recoveryMetrics = (): MetricItem[] => [
{ label: 'Recovery', value: '84', unit: '/100', delta: 'Train hard', tone: 'good', source: { kind: 'estimated', label: 'FitOnus model' } },
{ label: 'HRV', value: '68', unit: 'ms', delta: '+12% vs 7-day', tone: 'good', source: watch },
{ label: 'Resting HR', value: '52', unit: 'bpm', delta: '−3 vs avg', tone: 'good', source: watch },
{ label: 'Sleep', value: '7h 45m', delta: 'Score 88', tone: 'good', source: watch }];


const noDeviceResponse = (topic: string): CoachResponse => ({
  text: `I can’t see ${topic} yet because no wearable or health app is connected. I won’t guess at these numbers. Once you connect Apple Health or Health Connect, I can explain your trends.`,
  blocks: [{ type: 'link', label: 'Connect health data', description: 'Apple Health · Health Connect · Apple Watch', route: 'healthIntegration' }],
  followUps: ['How many calories do I have left today?', 'Create a 45-minute fat-loss workout'],
  toolCalls: ['getTodayHealthData']
});

type Rule = {test: RegExp;build: (q: string) => CoachResponse;};

const rules: Rule[] = [
{
  test: /tired|hrv up|why is my hrv|how am i doing/i,
  build: (q) => {
    const c = context();
    if (!c.hasDevice) return noDevice('sleep, HRV or heart rate');
    const tired = /tired/i.test(q);
    const doing = /how am i doing/i.test(q);
    return {
      text: tired ?
      'Your recovery signals actually look strong today, so the tiredness probably isn’t from under-recovery. Two things stand out: you’ve trained 4 days in a row, and you went to bed 45 minutes earlier than usual — a shifted schedule can leave you groggy even after good sleep. Light movement and daylight in the next hour usually help.' :
      doing ?
      `You’re on track. Recovery is 84, you’ve eaten ${Math.round(c.totals.kcal)} of ${nutritionGoals.kcal} kcal, and Chest + Triceps is queued. Protein is the one gap — you’re at ${Math.round(c.totals.protein)} g so far.` :
      'HRV rose to 68 ms, 12% above your 7-day average. The most likely contributors: your earliest bedtime in two weeks (10:55 PM), 1h 32m of deep sleep, and a lighter session yesterday. HRV varies day to day — I look at the 7-day trend before changing your plan.',
      blocks: [{ type: 'metrics', title: 'Today’s signals', items: recoveryMetrics() }],
      sources: ['Sleep · Apple Watch', 'HRV · Apple Watch', 'Workouts · last 7 days'],
      toolCalls: ['getTodayHealthData', 'getRecoveryScore', 'getSleepHistory'],
      followUps: ['Can I skip today’s workout?', 'Why is my resting heart rate increasing?', 'Show my progress since January'],
      medicalNote: true
    };
  }
},
{
  test: /skip/i,
  build: () => {
    const c = context();
    return {
      text: c.hasDevice ?
      'You can — one missed session won’t change your progress. But your body is well recovered (84), so today is a good day to train. If motivation is the issue, try the shorter version below: same muscles, half the time.' :
      'You can — one missed session won’t change your progress. Without recovery data I can’t say how ready your body is, so go by feel. If you’re short on time, the shorter version below keeps your streak alive.',
      blocks: [
      ...(c.hasDevice ? [{ type: 'metrics', title: 'Readiness', items: recoveryMetrics().slice(0, 3) } as Block] : []),
      { type: 'workout', title: 'Express Push', focus: 'Shortened · 25 min', durationMin: 25, exercises: [{ name: 'Barbell Bench Press', detail: '3 × 6 · 72.5 kg' }, { name: 'Incline Dumbbell Press', detail: '2 × 10 · 26 kg' }, { name: 'Parallel Bar Dips', detail: '2 × AMRAP' }] }],

      sources: c.hasDevice ? ['Recovery · FitOnus', 'Workouts · last 7 days'] : ['Workouts · last 7 days'],
      toolCalls: ['getRecoveryScore', 'getWorkoutHistory'],
      followUps: ['Motivate me to go to the gym', 'Create a 45-minute fat-loss workout']
    };
  }
},
{
  test: /heart rate/i,
  build: (q) => {
    const c = context();
    if (!c.hasDevice) return noDevice('heart rate');
    const resting = /resting/i.test(q);
    return {
      text: resting ?
      'Your resting heart rate climbed about 4 bpm between Sep 28 and Oct 2, then came back down to 52 today. That window lines up with three late nights and two hard leg sessions. Short rises like this are common with training load or poor sleep. If it stays 5+ bpm above your baseline for over a week, or you feel unwell, check in with a doctor.' :
      'Your resting heart rate is actually low today (52 bpm). Your daytime average is higher than usual — 81 vs 74 bpm — which often follows caffeine, warm weather or more walking. I can’t identify the exact cause from this data.',
      blocks: [
      {
        type: 'chart',
        title: 'Resting heart rate · 14 days',
        chart: 'line',
        unit: 'bpm',
        points: [
        { label: 'Sep 26', value: 53 }, { label: 'Sep 27', value: 53 }, { label: 'Sep 28', value: 55 }, { label: 'Sep 29', value: 56 },
        { label: 'Sep 30', value: 57 }, { label: 'Oct 1', value: 57 }, { label: 'Oct 2', value: 56 }, { label: 'Oct 3', value: 55 },
        { label: 'Oct 4', value: 54 }, { label: 'Oct 5', value: 55 }, { label: 'Oct 6', value: 53 }, { label: 'Oct 7', value: 54 },
        { label: 'Oct 8', value: 53 }, { label: 'Oct 9', value: 52 }],

        target: 54,
        targetLabel: 'Baseline 54',
        caption: 'Rose Sep 28–Oct 2, back below baseline now.',
        source: watch
      }],

      sources: ['Heart rate · Apple Watch', 'Sleep · Apple Watch', 'Workouts · FitOnus'],
      toolCalls: ['getTodayHealthData', 'getSleepHistory', 'getWorkoutHistory'],
      followUps: ['Why is my recovery lower this week?', 'Can I skip today’s workout?'],
      medicalNote: true
    };
  }
},
{
  test: /when will i reach|reach \d+/i,
  build: (q) => {
    const c = context();
    const current = c.weights[c.weights.length - 1].value;
    const asked = Number(q.match(/(\d+(\.\d+)?)\s?kg/i)?.[1]);
    const target = asked || 75;
    if (target >= current) {
      return {
        text: `You’re at ${current.toFixed(1)} kg and trending down about 0.4 kg a week, so at this pace you won’t reach ${target} kg — you’re moving away from it. To gain toward ${target} kg you’d need a calorie surplus and a muscle-gain plan. Want me to set that up, or did you mean your 75 kg goal?`,
        blocks: [{ type: 'chart', title: 'Weight since January', chart: 'line', unit: 'kg', points: weightByMonth, caption: 'Steady downward trend.', source: { kind: 'manual', label: 'Your weigh-ins' } }],
        sources: ['Weight · 10 months of entries', 'Goals'],
        toolCalls: ['getWeightHistory', 'getGoals'],
        followUps: ['When will I reach 75 kg?', 'Update my weight goal to 74 kg']
      };
    }
    const weeks = Math.ceil((current - target) / 0.4);
    return {
      text: `At your current pace (−0.4 kg/week over the last 8 weeks), you’d reach ${target} kg in about ${weeks} weeks — likely between late December and mid January. This is a projection, not a promise: holidays, water retention and plateaus can shift it by a few weeks.`,
      blocks: [
      {
        type: 'chart',
        title: `Projection to ${target} kg`,
        chart: 'line',
        unit: 'kg',
        points: weightByMonth.slice(-6),
        projection: [{ label: 'Nov', value: current - 1.6 }, { label: 'Dec', value: current - 3.1 }, { label: 'Jan', value: target }],
        band: [{ lower: current - 2.2, upper: current - 0.9 }, { lower: current - 4.0, upper: current - 2.0 }, { lower: target - 1.2, upper: target + 1.5 }],
        target,
        targetLabel: `Goal ${target} kg`,
        caption: 'Shaded area shows the likely range.',
        confidence: 'medium',
        source: { kind: 'estimated', label: 'Projection from your trend' }
      }],

      sources: ['Weight · last 8 weeks', 'Calories · last 30 days'],
      toolCalls: ['getWeightHistory', 'getNutritionLogs', 'getGoals'],
      followUps: ['Why has my weight stopped changing?', 'Compare this month with last month']
    };
  }
},
{
  test: /lost|since january|progress since|stopped changing|plateau/i,
  build: (q) => {
    const c = context();
    const latest = c.weights[c.weights.length - 1].value;
    const sinceJan = /january/i.test(q);
    const plateau = /stopped|plateau/i.test(q);
    const monthStart = c.weights[0].value;
    return {
      text: plateau ?
      'Your weight hasn’t stopped — it’s slowed. The last 10 days dropped 0.4 kg vs 0.9 kg the 10 days before. Weekend calories averaged 2,780 vs 2,190 on weekdays, which offsets about half the weekly deficit. Keeping Saturday and Sunday near 2,400 would likely restore your earlier pace.' :
      sinceJan ?
      `Since January you’ve gone from 84.2 kg to ${latest.toFixed(1)} kg — ${(84.2 - latest).toFixed(1)} kg down. The biggest drops came in March and September; June was flat. Your bench press went up over the same period, which suggests you’ve kept muscle while losing fat.` :
      `You’ve lost ${(monthStart - latest).toFixed(1)} kg in the last 3 weeks (${monthStart.toFixed(1)} → ${latest.toFixed(1)} kg). That’s about 0.5 kg a week — a healthy pace for keeping muscle.`,
      blocks: [
      {
        type: 'chart',
        title: sinceJan ? 'Weight since January' : 'Weight · last 3 weeks',
        chart: 'line',
        unit: 'kg',
        points: sinceJan ? weightByMonth : c.weights.map((w) => ({ label: w.date, value: w.value })),
        target: 75,
        targetLabel: 'Goal 75',
        caption: 'Daily weigh-ins vary with water — focus on the trend.',
        source: { kind: 'manual', label: 'Your weigh-ins' }
      },
      ...(plateau ?
      [{ type: 'comparison', title: 'Weekday vs weekend', columns: ['Weekdays', 'Weekends'], rows: [{ label: 'Avg calories', a: '2,190', b: '2,780', better: 'a' }, { label: 'Avg protein', a: '128 g', b: '102 g', better: 'a' }, { label: 'Steps', a: '9,420', b: '7,310', better: 'a' }] } as Block] :
      [])],

      sources: ['Weight · manual entries', 'Nutrition logs'],
      toolCalls: ['getWeightHistory', 'getNutritionLogs'],
      followUps: ['When will I reach 75 kg?', 'Compare this month with last month']
    };
  }
},
{
  test: /biryani/i,
  build: () => {
    const c = context();
    const left = nutritionGoals.kcal - c.totals.kcal;
    const biryani = foodDatabase[1];
    return {
      text: `Yes. You have ${Math.round(left).toLocaleString()} kcal left today. A restaurant plate of chicken biryani is roughly 650–800 kcal. If lunch and snacks stay around 800 kcal combined and you get protein in at lunch, it fits. A side of raita instead of a second helping keeps it lighter.`,
      memoryUsed: c.memoryOn ? 'You noted you’re eggetarian — want veg biryani instead? Similar calories, less protein.' : undefined,
      blocks: [
      {
        type: 'nutrition',
        title: 'Today’s budget with biryani',
        headline: { value: `${Math.round(left - biryani.kcal).toLocaleString()}`, label: 'kcal left after dinner' },
        rows: [
        { label: 'Eaten so far', value: `${Math.round(c.totals.kcal)} kcal` },
        { label: 'Chicken biryani · 1 plate', value: '~720 kcal', estimated: true },
        { label: 'Room for lunch + snacks', value: `${Math.round(left - biryani.kcal)} kcal` }]

      },
      {
        type: 'action',
        id: actionId(),
        title: 'Log biryani for dinner?',
        summary: [
        { label: 'Meal', value: 'Dinner' },
        { label: 'Food', value: 'Chicken biryani · 1 plate' },
        { label: 'Calories', value: '~720 kcal', estimated: true },
        { label: 'Protein', value: '~32 g', estimated: true }],

        payload: { kind: 'logMeal', meal: 'dinner', items: [{ ...biryani, id: `b-${Date.now()}` }] },
        status: 'pending'
      }],

      sources: ['Nutrition logs · today', 'Calorie goal'],
      toolCalls: ['getNutritionLogs', 'searchFood'],
      followUps: ['How many calories do I have left today?', 'Plan today’s meals with 160g protein under 2200 calories']
    };
  }
},
{
  test: /calories.*left|calories do i have|left today/i,
  build: () => {
    const c = context();
    const left = nutritionGoals.kcal - c.totals.kcal;
    return {
      text: `You have ${Math.round(left).toLocaleString()} kcal left of your ${nutritionGoals.kcal.toLocaleString()} target. Protein is furthest behind — ${Math.round(nutritionGoals.protein - c.totals.protein)} g to go, so prioritize it at lunch and after training.`,
      blocks: [
      {
        type: 'nutrition',
        title: 'Today so far',
        headline: { value: Math.round(left).toLocaleString(), label: 'kcal remaining' },
        rows: [],
        macros: [
        { label: 'Protein', value: Math.round(c.totals.protein), goal: nutritionGoals.protein },
        { label: 'Carbs', value: Math.round(c.totals.carbs), goal: nutritionGoals.carbs },
        { label: 'Fat', value: Math.round(c.totals.fat), goal: nutritionGoals.fat },
        { label: 'Fiber', value: Math.round(c.totals.fiber), goal: nutritionGoals.fiber }]

      }],

      sources: ['Nutrition logs · today'],
      toolCalls: ['getNutritionLogs', 'getGoals'],
      followUps: ['Can I eat biryani tonight?', 'Plan today’s meals with 160g protein under 2200 calories']
    };
  }
},
{
  test: /create.*workout|fat-loss workout|fat loss workout|45-minute/i,
  build: () => ({
    text: 'Here’s a 45-minute fat-loss session built around your gym equipment. It’s a circuit with short rests to keep your heart rate up, and it avoids overhead pressing because of the shoulder note in your memory.',
    memoryUsed: 'Avoids overhead pressing (left-shoulder note from Aug 28).',
    blocks: [
    {
      type: 'workout',
      title: generatedFatLossSession.title,
      focus: 'Fat loss · Circuit',
      durationMin: 45,
      exercises: generatedFatLossSession.exercises.map((e) => ({
        name: exerciseById(e.exerciseId).name,
        detail: `${e.sets} × ${e.reps}${e.weight ? ` · ${e.weight} kg` : ''}`
      }))
    },
    {
      type: 'action',
      id: actionId(),
      title: 'Use this as today’s workout?',
      summary: [
      { label: 'Replaces', value: 'Chest + Triceps' },
      { label: 'Duration', value: '45 min' },
      { label: 'Est. burn', value: '380–450 kcal', estimated: true }],

      payload: { kind: 'createPlan' },
      status: 'pending'
    }],

    sources: ['Goals', 'Equipment preferences', 'Recovery · today'],
    toolCalls: ['getGoals', 'getRecoveryScore', 'createWorkoutPlan'],
    followUps: ['Motivate me to go to the gym', 'Can I skip today’s workout?']
  })
},
{
  test: /plan.*meals|160 ?g protein/i,
  build: () => ({
    text: 'Here’s a full day at about 1,930 kcal and 172 g protein — under your 2,200 limit with room for a small treat. Breakfast is what you already logged.',
    memoryUsed: 'Built around your eggetarian preference and Indian cuisine.',
    blocks: [
    {
      type: 'nutrition',
      title: 'Meal plan · 1,930 kcal · 172 g protein',
      rows: [
      { label: 'Breakfast · logged', value: '420 kcal', detail: 'Masala oats, 2 boiled eggs · 25 g' },
      { label: 'Lunch', value: '610 kcal', detail: 'Paneer tikka bowl, dal, salad · 46 g' },
      { label: 'Post-workout', value: '120 kcal', detail: 'Whey isolate in water · 27 g' },
      { label: 'Snack', value: '260 kcal', detail: 'Greek yogurt, berries, almonds · 42 g' },
      { label: 'Dinner', value: '520 kcal', detail: 'Egg bhurji, 2 rotis, cucumber salad · 32 g' }],

      note: 'Calories per meal are estimates based on typical portions.'
    }],

    sources: ['Nutrition goals', 'Food preferences (memory)'],
    toolCalls: ['getNutritionLogs', 'getGoals', 'searchFood'],
    followUps: ['How many calories do I have left today?', 'Can I eat biryani tonight?']
  })
},
{
  test: /compare.*month|this month with last/i,
  build: () => ({
    text: 'September beat August on almost every measure. Training consistency was the biggest change: 19 sessions vs 16. Protein is still under target in both months, which is the next lever.',
    blocks: [
    {
      type: 'comparison',
      title: 'September vs August',
      columns: ['Sep', 'Aug'],
      rows: [
      { label: 'Workouts', a: '19', b: '16', better: 'a' },
      { label: 'Weight change', a: '−1.2 kg', b: '−0.6 kg', better: 'a' },
      { label: 'Avg sleep', a: '7h 12m', b: '6h 58m', better: 'a' },
      { label: 'Avg recovery', a: '71', b: '66', better: 'a' },
      { label: 'Avg protein', a: '124 g', b: '112 g', better: 'a' },
      { label: 'Avg steps', a: '8,940', b: '9,120', better: 'b' }]

    },
    { type: 'link', label: 'Open September report', description: 'Full monthly analysis and trends', route: 'monthlyReport' }],

    sources: ['Workouts', 'Weight', 'Sleep · Apple Watch', 'Nutrition logs'],
    toolCalls: ['compareProgress', 'generateMonthlyReport'],
    followUps: ['Show my progress since January', 'When will I reach 75 kg?']
  })
},
{
  test: /motivat/i,
  build: () => ({
    text: 'Six weeks ago your bench top set was 65 kg. On Monday you hit 72.5. You’re 3.4 kg from your goal weight, on a 4-day streak, and your body is recovered. The hard part — showing up consistently — you’re already doing. Today’s session is 52 minutes. Start with the first set and decide after that.',
    blocks: [
    {
      type: 'metrics',
      title: 'What you’ve built',
      items: [
      { label: 'Streak', value: '4', unit: 'days', tone: 'good', source: { kind: 'manual', label: 'FitOnus logs' } },
      { label: 'Bench PR', value: '72.5', unit: 'kg', delta: '+7.5 kg in 6 wks', tone: 'good', source: { kind: 'manual', label: 'FitOnus logs' } },
      { label: 'Lost', value: '5.8', unit: 'kg', delta: 'Since January', tone: 'good', source: { kind: 'manual', label: 'Your weigh-ins' } }]

    },
    { type: 'action', id: actionId(), title: 'Start Chest + Triceps now?', summary: [{ label: 'Duration', value: '52 min' }, { label: 'First set', value: 'Bench 72.5 kg × 6–8' }], payload: { kind: 'startWorkout' }, status: 'pending' }],

    sources: ['Workouts', 'Weight', 'Personal records'],
    toolCalls: ['getWorkoutHistory', 'getWeightHistory'],
    followUps: ['Can I skip today’s workout?']
  })
},
{
  test: /log.*(breakfast|lunch|dinner|snack|meal)/i,
  build: (q) => {
    const meal = (q.match(/breakfast|lunch|dinner|snack/i)?.[0].toLowerCase() ?? 'lunch') as 'breakfast' | 'lunch' | 'dinner' | 'snack';
    const mealKey = meal === 'snack' ? 'snacks' : meal;
    const items = [foodDatabase[4], foodDatabase[8]].map((f, i) => ({ ...f, id: `v-${Date.now()}-${i}` }));
    return {
      text: `Here’s what I’ll log for ${meal}. I matched it to your usual foods — edit anything before confirming.`,
      blocks: [
      {
        type: 'action',
        id: actionId(),
        title: `Log ${meal}`,
        summary: [
        { label: 'Greek yogurt, plain', value: '140 kcal' },
        { label: 'Banana, medium', value: '105 kcal' },
        { label: 'Total', value: '245 kcal · 16 g protein' }],

        payload: { kind: 'logMeal', meal: mealKey as 'breakfast', items },
        status: 'pending'
      }],

      sources: ['Recent foods', 'Food database'],
      toolCalls: ['searchFood', 'logMeal'],
      followUps: ['How many calories do I have left today?']
    };
  }
},
{
  test: /finished \d+ sets|log.*workout|log.*sets/i,
  build: (q) => {
    const n = Number(q.match(/(\d+) sets/)?.[1] ?? 3);
    const sets = Array.from({ length: n }, (_, i) => ({ weight: 72.5, reps: [8, 8, 7, 6][i] ?? 6 }));
    return {
      text: `Nice work. I’ll log ${n} sets of Barbell Bench Press using today’s plan weights. Adjust if anything was different.`,
      blocks: [
      {
        type: 'action',
        id: actionId(),
        title: `Log ${n} sets`,
        summary: [{ label: 'Exercise', value: 'Barbell Bench Press' }, ...sets.map((s, i) => ({ label: `Set ${i + 1}`, value: `${s.weight} kg × ${s.reps}` }))],
        payload: { kind: 'logWorkout', exercise: 'Barbell Bench Press', sets },
        status: 'pending'
      }],

      sources: ['Today’s plan'],
      toolCalls: ['logWorkout'],
      followUps: ['How am I doing today?']
    };
  }
},
{
  test: /my weight is|i weigh|weighed|update today.?s weight/i,
  build: (q) => {
    const value = Number(q.match(/(\d{2,3}(\.\d)?)/)?.[1] ?? 78.1);
    return {
      text: `Got it. I’ll record ${value.toFixed(1)} kg for today. This replaces this morning’s ${useWeightStore.getState().entries.slice(-1)[0].value.toFixed(1)} kg entry.`,
      blocks: [
      { type: 'action', id: actionId(), title: 'Update today’s weight', summary: [{ label: 'New weight', value: `${value.toFixed(1)} kg` }, { label: 'Date', value: 'Fri, Oct 9' }, { label: 'Source', value: 'Manual' }], payload: { kind: 'updateWeight', value }, status: 'pending' }],

      sources: ['Weight history'],
      toolCalls: ['updateWeight'],
      followUps: ['When will I reach 75 kg?']
    };
  }
},
{
  test: /start.*workout/i,
  build: () => ({
    text: 'Ready when you are. Chest + Triceps: 6 exercises, about 52 minutes. I’ll track sets and start rest timers for you.',
    blocks: [
    { type: 'action', id: actionId(), title: 'Start Chest + Triceps', summary: [{ label: 'First exercise', value: 'Barbell Bench Press' }, { label: 'Target', value: '4 × 6–8 · 72.5 kg' }], payload: { kind: 'startWorkout' }, status: 'pending' }],

    sources: ['Today’s plan'],
    toolCalls: ['getWorkoutHistory']
  })
},
{
  test: /goal/i,
  build: () => ({
    text: 'You’re 3.4 kg from your current 75 kg target and ahead of schedule. I can tighten the goal to 74 kg by the same date — that keeps your pace at about 0.45 kg/week.',
    blocks: [
    { type: 'action', id: actionId(), title: 'Update weight goal', summary: [{ label: 'Current target', value: '75 kg' }, { label: 'New target', value: '74 kg' }, { label: 'Deadline', value: 'Jan 31, 2027' }], payload: { kind: 'updateGoal', goalId: 'g1', target: 74 }, status: 'pending' }],

    sources: ['Goals', 'Weight trend'],
    toolCalls: ['getGoals', 'getWeightHistory']
  })
},
{
  test: /report/i,
  build: () => ({
    text: 'Your weekly report for Sep 27 – Oct 3 is ready. Highlights: 5 workouts, −0.4 kg, sleep averaged 7h 21m. Protein was the weakest area.',
    blocks: [
    { type: 'link', label: 'Weekly report', description: 'Sep 27 – Oct 3 · generated Sunday', route: 'weeklyReport' },
    { type: 'link', label: 'Monthly report', description: 'September 2026', route: 'monthlyReport' }],

    sources: ['All tracked data'],
    toolCalls: ['generateWeeklyReport']
  })
},
{
  test: /recovery/i,
  build: () => {
    const c = context();
    if (!c.hasDevice) return noDevice('recovery inputs');
    return {
      text: 'This week averaged 71 vs 78 last week. The dip came Wednesday (58) after your latest bedtime (12:12 AM) and a heavy leg day. It has bounced back to 84 today. One short night doesn’t need a plan change — two in a row would.',
      blocks: [
      { type: 'chart', title: 'Recovery · 7 days', chart: 'bar', unit: '', points: [{ label: 'Sat', value: 78 }, { label: 'Sun', value: 81 }, { label: 'Mon', value: 70 }, { label: 'Tue', value: 66 }, { label: 'Wed', value: 58 }, { label: 'Thu', value: 74 }, { label: 'Fri', value: 84 }], caption: 'Score combines HRV, resting HR, sleep and prior strain.', source: { kind: 'estimated', label: 'FitOnus model' } },
      { type: 'link', label: 'Open recovery breakdown', description: 'See each input and its impact', route: 'recovery' }],

      sources: ['HRV · Apple Watch', 'Sleep · Apple Watch', 'Workouts'],
      toolCalls: ['getRecoveryScore', 'getSleepHistory'],
      medicalNote: true
    };
  }
}];


function noDevice(topic: string) {
  return noDeviceResponse(topic);
}

export function buildCoachResponse(question: string): CoachResponse {
  const rule = rules.find((r) => r.test.test(question));
  if (rule) return rule.build(question);
  const c = context();
  return {
    text: c.hasDevice ?
    'I don’t have a specific analysis for that yet, but here’s where you stand today. Ask me about sleep, recovery, workouts, meals, or your weight trend and I’ll dig in.' :
    'I don’t have a specific analysis for that yet. I can help with workouts, meals and weight — and with recovery once a device is connected.',
    blocks: c.hasDevice ? [{ type: 'metrics', title: 'Today at a glance', items: recoveryMetrics() }] : [],
    sources: c.hasDevice ? ['Today’s health data'] : [],
    toolCalls: ['getTodayHealthData'],
    followUps: ['Why am I feeling tired today?', 'How many calories do I have left today?', 'Show my progress since January']
  };
}