import type { CoachInsightsService } from '../application/ports.js';
import type {
  CoachInsightItem,
  CoachInsightsResponse,
  UserFitnessContext,
} from '../domain/coach.types.js';
import type { GeminiClient } from './gemini-client.js';

/**
 * Isolated AI Coach Insights Service.
 * Generates structured, evidence-based fitness insights with multilingual support and deterministic offline fallback.
 */
export class GeminiCoachInsightsService implements CoachInsightsService {
  constructor(private readonly client: GeminiClient) {}

  async generateInsights(
    context: UserFitnessContext,
    lang?: string,
  ): Promise<CoachInsightsResponse> {
    const hasSufficientData = Boolean(
      context.recentWorkouts.length > 0 ||
        context.todayNutrition.caloriesConsumed > 0 ||
        context.todayNutrition.waterIntakeMl > 0 ||
        context.latestWeightKg !== null ||
        context.activeGoals.length > 0 ||
        context.todayPlannedWorkout !== null,
    );

    const isTa = lang === 'ta';
    const isTanglish = lang === 'tanglish';

    if (!hasSufficientData) {
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

    const prompt = this.buildInsightsPrompt(context, lang);

    try {
      const rawText = await this.client.generateText(prompt, 20_000);
      return this.parseInsightsOutput(rawText, context, isTa, isTanglish);
    } catch {
      // Graceful degradation: fallback to deterministic data-backed insights
      return this.buildDeterministicInsights(context, isTa, isTanglish);
    }
  }

  private buildInsightsPrompt(context: UserFitnessContext, lang?: string): string {
    const { profile, todayNutrition, recentWorkouts, todayPlannedWorkout, activeGoals, latestWeightKg } = context;

    const isTa = lang === 'ta';
    const isTanglish = lang === 'tanglish';

    const langInstruction = isTa
      ? 'CRITICAL: Respond STRICTLY in Tamil (தமிழ் script). Keep terms like calories, protein, workout easy to understand.'
      : isTanglish
        ? 'CRITICAL: Respond STRICTLY in Tanglish (Tamil words written in English letters, e.g. "Kcal intake reach pannunga", "Rest day romba mukkiyam").'
        : 'Respond in clean, encouraging English.';

    return `You are FitOnus AI Insights Engine — an elite sports scientist and strength coach.
Generate 2 to 3 concise, highly personalized actionable insights based on the user's REAL fitness data.

${langInstruction}

USER PROFILE:
- Name: ${profile.displayName}
- Goal: ${profile.primaryGoal ?? 'Fitness & Health'}
- Experience: ${profile.experienceLevel ?? 'Intermediate'}
- Current Weight: ${latestWeightKg ?? profile.currentWeightKg ?? 'Not set'} kg
- Daily Targets: Calories ${profile.dailyCalorieTarget ?? 'Not set'} kcal | Protein ${profile.dailyProteinGrams ?? 'Not set'} g

TODAY'S ACTIVITY & NUTRITION:
- Calories: ${todayNutrition.caloriesConsumed} kcal (Target: ${todayNutrition.calorieTarget ?? 'Not set'})
- Protein: ${todayNutrition.proteinGrams} g (Target: ${todayNutrition.proteinTarget ?? 'Not set'})
- Water Logged Today: ${todayNutrition.waterIntakeMl} ml
- Planned Workout Today: ${todayPlannedWorkout ? `${todayPlannedWorkout.name} (~${todayPlannedWorkout.durationMinutes} min)` : 'None scheduled'}

RECENT WORKOUTS:
${
  recentWorkouts.length > 0
    ? recentWorkouts.map((w) => `- ${w.name}: ${w.durationMinutes}m, ${w.totalSets} sets, ${w.volumeKg}kg volume, ${w.caloriesBurned ?? 0} kcal`).join('\n')
    : 'None logged yet'
}

ACTIVE GOALS:
${
  activeGoals.length > 0
    ? activeGoals.map((g) => `- ${g.title}: ${g.currentValue}/${g.targetValue} ${g.unit}`).join('\n')
    : 'None'
}

STRICT INSTRUCTIONS:
1. Generate exactly 2 or 3 insights covering:
   - Workout consistency or progression
   - Nutrition / protein progress
   - Hydration or recovery suggestion (ONLY if backed by actual data above)
2. NEVER invent missing wearable metrics (no fake sleep stages, fake HRV, fake steps).
3. Do not give medical diagnoses or medication advice.
4. Output STRICTLY VALID JSON without markdown fences matching this schema:
{
  "greeting": "Personalized greeting like 'Good morning, Alex!'",
  "recommendation": "Short 1-sentence action recommendation for today",
  "insights": [
    {
      "id": "ins-1",
      "title": "Short punchy headline (max 50 chars)",
      "description": "1-2 sentence evidence-based guidance (max 160 chars)",
      "category": "workout",
      "priority": "high",
      "severity": "positive",
      "action": "View Workout",
      "question": "What should I focus on for today's workout?",
      "evidence": ["Chest + Triceps scheduled"],
      "confidence": "high",
      "requiresDevice": false
    }
  ]
}`;
  }

  private parseInsightsOutput(
    rawText: string,
    context: UserFitnessContext,
    isTa: boolean,
    isTanglish: boolean,
  ): CoachInsightsResponse {
    let cleaned = rawText;
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    try {
      const parsed = JSON.parse(cleaned);
      if (Array.isArray(parsed.insights) && parsed.insights.length > 0) {
        const validatedInsights: CoachInsightItem[] = parsed.insights.map((item: any, idx: number) => ({
          id: typeof item.id === 'string' && item.id ? item.id : `ins-${Date.now()}-${idx}`,
          title: String(item.title || 'Fitness Insight'),
          description: String(item.description || ''),
          category: ['workout', 'nutrition', 'hydration', 'goal', 'recovery'].includes(item.category)
            ? item.category
            : 'workout',
          priority: ['high', 'medium', 'low'].includes(item.priority) ? item.priority : 'medium',
          severity: ['positive', 'watch', 'info'].includes(item.severity) ? item.severity : 'info',
          action: String(item.action || 'Ask Coach'),
          question: String(item.question || 'How can I improve my progress?'),
          evidence: Array.isArray(item.evidence) ? item.evidence.map(String) : [],
          confidence: ['high', 'medium', 'low'].includes(item.confidence) ? item.confidence : 'high',
          requiresDevice: Boolean(item.requiresDevice),
        }));

        return {
          greeting: typeof parsed.greeting === 'string' ? parsed.greeting : `Hello, ${context.profile.displayName}!`,
          recommendation: typeof parsed.recommendation === 'string' ? parsed.recommendation : null,
          insights: validatedInsights,
          generatedAt: new Date().toISOString(),
          hasSufficientData: true,
        };
      }
    } catch {
      // Fallback on JSON parse error
    }

    return this.buildDeterministicInsights(context, isTa, isTanglish);
  }

  private buildDeterministicInsights(
    context: UserFitnessContext,
    isTa: boolean,
    isTanglish: boolean,
  ): CoachInsightsResponse {
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
}

