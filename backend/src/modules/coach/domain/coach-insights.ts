import type { CoachInsightItem, CoachInsightsResponse, UserFitnessContext } from './coach.types.js';

/**
 * Pure rules for coach insights that stay in Node (no AI, no I/O):
 *  - when there is too little data to personalise anything,
 *  - the friendly "log your first workout" answer for that case,
 *  - the deterministic, data-backed insights used whenever the AI backend cannot give usable ones.
 *
 * Moved unchanged from the former `GeminiCoachInsightsService`; `tests/fixtures/coach-insights/
 * deterministic_cases.json` holds what that code produced for nine synthetic contexts in every language.
 */

/** True when the user has logged anything at all that insights can be based on. */
export function hasSufficientInsightsData(context: UserFitnessContext): boolean {
  return Boolean(
    context.recentWorkouts.length > 0 ||
      context.todayNutrition.caloriesConsumed > 0 ||
      context.todayNutrition.waterIntakeMl > 0 ||
      context.latestWeightKg !== null ||
      context.activeGoals.length > 0 ||
      context.todayPlannedWorkout !== null,
  );
}

/** The answer for a user with no data yet. Costs no AI call. */
export function buildWelcomeInsights(context: UserFitnessContext, lang?: string): CoachInsightsResponse {
  const isTa = lang === 'ta';
  const isTanglish = lang === 'tanglish';
  return {
    greeting: isTa
      ? `வணக்கம், ${context.profile.displayName}!`
      : isTanglish
        ? `Vanakkam, ${context.profile.displayName}!`
        : `Welcome, ${context.profile.displayName}!`,
    recommendation: isTa
      ? 'உங்கள் முதல் உடற்பயிற்சி அல்லது உணவை பதிவு செய்யவும்.'
      : isTanglish
        ? 'First workout or food log pannunga, personalized insights generate aagum.'
        : 'Log your first workout, meal, or hydration to unlock personalized AI insights.',
    insights: [],
    generatedAt: new Date().toISOString(),
    hasSufficientData: false,
  };
}

/** Data-backed insights built without AI (greeting, planned or last workout, calories, water). */
export function buildDeterministicInsights(context: UserFitnessContext, lang?: string): CoachInsightsResponse {
  const isTa = lang === 'ta';
  const isTanglish = lang === 'tanglish';

  const { profile, todayNutrition, todayPlannedWorkout, recentWorkouts } = context;
  const items: CoachInsightItem[] = [];

  // 1. Workout Insight
  if (todayPlannedWorkout) {
    items.push({
      id: 'ins-det-workout',
      title: isTa
        ? `திட்டமிடப்பட்ட உடற்பயிற்சி: ${todayPlannedWorkout.name}`
        : isTanglish
          ? `Today's Workout: ${todayPlannedWorkout.name}`
          : `Today: ${todayPlannedWorkout.name}`,
      description: isTa
        ? `இன்று ${todayPlannedWorkout.durationMinutes} நிமிட உடற்பயிற்சி திட்டமிடப்பட்டுள்ளது.`
        : isTanglish
          ? `${todayPlannedWorkout.name} (~${todayPlannedWorkout.durationMinutes} min) ready. Warm up nalla pannunga!`
          : `You have ${todayPlannedWorkout.name} (~${todayPlannedWorkout.durationMinutes} min) scheduled. Focus on clean form and steady pacing.`,
      category: 'workout',
      priority: 'high',
      severity: 'positive',
      action: isTa ? 'பயிற்சியைக் காண்க' : isTanglish ? 'Start Workout' : 'Start Workout',
      question: `How should I warm up for ${todayPlannedWorkout.name}?`,
      evidence: [`${todayPlannedWorkout.name} scheduled`],
      confidence: 'high',
      requiresDevice: false,
    });
  } else if (recentWorkouts.length > 0) {
    const last = recentWorkouts[0]!;
    items.push({
      id: 'ins-det-last-workout',
      title: isTa ? 'உடற்பயிற்சி நிலைத்தன்மை' : isTanglish ? 'Workout Streak On Track' : 'Workout Consistency',
      description: isTa
        ? `${last.name} முடித்ததற்கு பாராட்டுக்கள்!`
        : isTanglish
          ? `${last.name} successfully mudichuteenga! Recovery and hydration mukkiyam.`
          : `Great job completing ${last.name} (${last.durationMinutes} min). Prioritize protein intake for muscle recovery.`,
      category: 'workout',
      priority: 'medium',
      severity: 'positive',
      action: 'View Progress',
      question: 'What workout should I do next for balanced recovery?',
      evidence: [`${last.name} completed`],
      confidence: 'high',
      requiresDevice: false,
    });
  }

  // 2. Nutrition Insight
  if (todayNutrition.calorieTarget && todayNutrition.calorieTarget > 0) {
    const remainingKcal = todayNutrition.calorieTarget - todayNutrition.caloriesConsumed;
    const title = remainingKcal > 0
      ? (isTa ? `${remainingKcal} கலோரிகள் மீதமுள்ளன` : isTanglish ? `${remainingKcal} kcal remaining irukku` : `${remainingKcal} kcal remaining today`)
      : (isTa ? 'இன்றைய கலோரி இலக்கை அடைந்துவிட்டீர்கள்' : isTanglish ? 'Calorie target reached!' : 'Calorie target achieved today');

    items.push({
      id: 'ins-det-nutrition',
      title,
      description: isTa
        ? `இன்று ${todayNutrition.caloriesConsumed} / ${todayNutrition.calorieTarget} கலோரிகள் உட்கொள்ளப்பட்டுள்ளன.`
        : isTanglish
          ? `Consumed ${todayNutrition.caloriesConsumed} of ${todayNutrition.calorieTarget} kcal. Protein: ${todayNutrition.proteinGrams}g.`
          : `You have consumed ${todayNutrition.caloriesConsumed} of ${todayNutrition.calorieTarget} kcal so far today.`,
      category: 'nutrition',
      priority: 'medium',
      severity: remainingKcal < 0 ? 'watch' : 'info',
      action: isTa ? 'உணவு திட்டம்' : isTanglish ? 'Plan Meals' : 'Plan Meals',
      question: 'How should I hit my remaining nutrition targets today?',
      evidence: [`${todayNutrition.caloriesConsumed} / ${todayNutrition.calorieTarget} kcal`],
      confidence: 'high',
      requiresDevice: false,
    });
  }

  // 3. Hydration Insight
  if (todayNutrition.waterIntakeMl > 0) {
    const liters = (todayNutrition.waterIntakeMl / 1000).toFixed(1);
    items.push({
      id: 'ins-det-water',
      title: isTa ? `நீர் அளவு: ${liters} லிட்டர்` : isTanglish ? `Water: ${liters}L logged today` : `Water Logged: ${liters}L`,
      description: isTa
        ? 'போதுமான அளவு தண்ணீர் குடிப்பது தசை மீட்பிற்கு மிகவும் அவசியம்.'
        : isTanglish
          ? 'Water intake nalla irukku bro, hydration recovery-ku romba mukkiyam!'
          : 'Good hydration supports recovery and muscle repair during daily training.',
      category: 'hydration',
      priority: 'low',
      severity: 'positive',
      action: 'Log Water',
      question: 'Am I drinking enough water for my workout level?',
      evidence: [`${todayNutrition.waterIntakeMl} ml logged`],
      confidence: 'high',
      requiresDevice: false,
    });
  }

  return {
    greeting: `Hello, ${profile.displayName}!`,
    recommendation: todayPlannedWorkout
      ? `Today's recommendation: ${todayPlannedWorkout.name}.`
      : 'Stay active, keep hydrated, and hit your nutrition targets today.',
    insights: items,
    generatedAt: new Date().toISOString(),
    hasSufficientData: true,
  };
}
