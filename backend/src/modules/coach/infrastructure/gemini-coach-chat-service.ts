import type { CoachChatService } from '../application/ports.js';
import type {
  ChatMessageTurn,
  CoachResponse,
  UserFitnessContext,
} from '../domain/coach.types.js';
import type { GeminiClient } from './gemini-client.js';

/**
 * Isolated AI Coach Chat Service.
 * Handles system prompt engineering, context injection, and response parsing for conversational fitness coaching.
 */
export class GeminiCoachChatService implements CoachChatService {
  constructor(private readonly client: GeminiClient) {}

  private buildSystemPrompt(context: UserFitnessContext): string {
    const { profile, todayNutrition, recentWorkouts, todayPlannedWorkout, activeGoals, latestWeightKg } = context;

    return `You are OnusFit AI Coach — an elite, encouraging, science-based fitness coach and sports nutritionist for the OnusFit health app.

USER FITNESS PROFILE:
- Name: ${profile.displayName}
- Gender: ${profile.sex ?? 'Not specified'}
- Age: ${profile.age ? `${profile.age} years old` : 'Not specified'}
- Height: ${profile.heightCm ? `${profile.heightCm} cm` : 'Not specified'}
- Current Weight: ${latestWeightKg ?? profile.currentWeightKg ?? 'Not recorded'} kg
- Target Weight: ${profile.targetWeightKg ? `${profile.targetWeightKg} kg` : 'Not set'}
- Primary Goal: ${profile.primaryGoal ?? 'General fitness & health'}
- Fitness Level: ${profile.experienceLevel ?? 'Intermediate'}
- Workout Place: ${profile.preferredWorkoutPlace ?? 'Gym/Home'}
- Target Workout Days: ${profile.workoutDaysPerWeek ? `${profile.workoutDaysPerWeek} days/week` : 'Not specified'}
- Diet Type: ${profile.dietType ?? 'Standard'}
- Daily Targets: Calories ${profile.dailyCalorieTarget ?? 'Unset'} kcal | Protein ${profile.dailyProteinGrams ?? 'Unset'} g

TODAY'S ACTIVITY & NUTRITION (LOCAL DATA):
- Calories Consumed: ${todayNutrition.caloriesConsumed} kcal (Target: ${todayNutrition.calorieTarget ?? 'Not set'})
- Protein: ${todayNutrition.proteinGrams} g (Target: ${todayNutrition.proteinTarget ?? 'Not set'})
- Carbs: ${todayNutrition.carbsGrams} g | Fat: ${todayNutrition.fatGrams} g
- Water: ${todayNutrition.waterIntakeMl} ml (${(todayNutrition.waterIntakeMl / 1000).toFixed(1)} L)
- Next/Planned Workout: ${todayPlannedWorkout ? `${todayPlannedWorkout.name} (~${todayPlannedWorkout.durationMinutes} min, ${todayPlannedWorkout.exercisesCount} exercises)` : 'No scheduled workout today'}
- Recent Workouts Logged: ${
      recentWorkouts.length > 0
        ? recentWorkouts.map((w) => `${w.name} (${w.durationMinutes} min, ${w.totalSets} sets, ${w.caloriesBurned ?? 0} kcal)`).join('; ')
        : 'None logged recently'
    }
- Active Goals: ${
      activeGoals.length > 0
        ? activeGoals.map((g) => `${g.title} (${g.currentValue}/${g.targetValue} ${g.unit})`).join('; ')
        : 'None'
    }

CRITICAL RULES:
1. Ground your answers strictly in the provided data. NEVER invent or hallucinate missing metrics. If wearable/sleep/HRV data is requested and not listed above, state clearly that no wearable/health sensor is currently connected.
2. Language Support: Fully support English, Tamil (தமிழ் script), and Tanglish (Tamil words written in English letters, e.g., "Innaiku workout panna mudiyuma?", "Kcal intake sariya irukka?"). ALWAYS match the language/style the user addresses you in. If the user asks in Tanglish, answer in warm, friendly Tanglish. If in Tamil, answer in Tamil. If in English, answer in English.
3. Tone: Inspiring, empathetic, evidence-based, concise, actionable.
4. Response Format: Return a VALID JSON object ONLY. Do not wrap in markdown backticks. The JSON must match:
{
  "text": "Your direct response to the user. Use clear paragraphs or bullet points.",
  "followUps": ["Short suggested follow up question 1", "Short suggested follow up question 2"],
  "sources": ["Profile", "Today's Nutrition"],
  "medicalNote": false
}
If discussing medical symptoms, injuries, or severe pain, include "medicalNote": true and advise consulting a healthcare professional.`;
  }

  async generateCoachResponse(
    message: string,
    context: UserFitnessContext,
    history: ChatMessageTurn[] = [],
    memories: string[] = [],
  ): Promise<CoachResponse> {
    const systemInstruction = this.buildSystemPrompt(context);

    let fullPrompt = `${systemInstruction}\n\n`;

    if (memories.length > 0) {
      fullPrompt += `USER-APPROVED FITNESS MEMORIES & PREFERENCES:\n`;
      for (const m of memories) {
        fullPrompt += `- ${m}\n`;
      }
      fullPrompt += `\n`;
    }

    if (history.length > 0) {
      fullPrompt += `PREVIOUS RECENT CHAT HISTORY:\n`;
      for (const turn of history.slice(-6)) {
        fullPrompt += `${turn.role === 'user' ? 'User' : 'Coach'}: ${turn.text}\n`;
      }
      fullPrompt += `\n`;
    }

    fullPrompt += `CURRENT USER INQUIRY:\n${message}\n\nREPLY STRICTLY IN VALID JSON ONLY:`;

    const rawText = await this.client.generateText(fullPrompt, 20_000);
    const response = this.parseGeminiOutput(rawText);

    if (memories.length > 0 && response.sources && !response.sources.includes('AI Memory')) {
      response.sources.push('AI Memory');
    }

    return response;
  }

  private parseGeminiOutput(rawText: string): CoachResponse {
    let cleaned = rawText;
    if (cleaned.startsWith('```json')) {
      cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    } else if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
    }

    try {
      const parsed = JSON.parse(cleaned);
      if (typeof parsed.text === 'string') {
        return {
          text: parsed.text,
          followUps: Array.isArray(parsed.followUps) ? parsed.followUps.map(String) : [],
          sources: Array.isArray(parsed.sources) ? parsed.sources.map(String) : [],
          medicalNote: Boolean(parsed.medicalNote),
          blocks: Array.isArray(parsed.blocks) ? parsed.blocks : undefined,
        };
      }
    } catch {
      // Fallback: return rawText as text
    }

    return {
      text: rawText,
      followUps: [],
      sources: ['OnusFit Coach Engine'],
    };
  }
}

