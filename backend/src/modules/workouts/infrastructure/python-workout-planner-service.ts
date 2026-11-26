import crypto from 'node:crypto';
import { z } from 'zod';
import { markAiRequestDispatched } from '../../../shared/ai/ai-usage.js';
import { PythonAiError, type PythonAiClient } from '../../../shared/ai/python-ai-client.js';
import { toPublicAiError } from '../../../shared/ai/python-ai-errors.js';
import { AppError } from '../../../shared/errors/app-error.js';
import { currentCorrelationId } from '../../../shared/logging/request-correlation.js';
import type {
  AdaptAiWorkoutPlanInput,
  AiWorkoutPlanResult,
  GenerateAiWorkoutPlanInput,
  IAiWorkoutPlanner,
} from '../application/ports.js';

export const WORKOUT_PLANNER_SCOPE = 'ai:workout:plan';
export const GENERATE_WORKOUT_PLAN_PATH = '/internal/v1/ai/workout-planner/generate';
export const ADAPT_WORKOUT_PLAN_PATH = '/internal/v1/ai/workout-planner/adapt';

const exerciseAlternativeSchema = z.object({
  exercise_id: z.string(),
  name: z.string(),
  equipment: z.string(),
  reason: z.string(),
});

const exerciseSelectionSchema = z.object({
  exercise_id: z.string(),
  name: z.string(),
  target_muscle: z.string(),
  equipment: z.string(),
  target_sets: z.number().int(),
  target_reps: z.string(),
  rest_seconds: z.number().int(),
  target_weight_kg: z.number(),
  intensity: z.string(),
  notes: z.string().nullable().optional(),
  order_index: z.number().int(),
  alternatives: z.array(exerciseAlternativeSchema).default([]),
});

const warmupCooldownSchema = z.object({
  exercises: z.array(z.string()).default([]),
  duration_minutes: z.number().int().default(5),
  notes: z.string().nullable().optional(),
});

const singleSessionPlanSchema = z.object({
  session_id: z.string(),
  day_name: z.string(),
  focus: z.string(),
  estimated_duration_minutes: z.number().int(),
  difficulty: z.string(),
  warmup: warmupCooldownSchema.default({ exercises: [], duration_minutes: 5 }),
  exercises: z.array(exerciseSelectionSchema),
  cooldown: warmupCooldownSchema.default({ exercises: [], duration_minutes: 5 }),
  notes: z.string().nullable().optional(),
});

const weeklyWorkoutScheduleSchema = z.object({
  plan_id: z.string(),
  title: z.string(),
  description: z.string(),
  goal: z.string(),
  level: z.string(),
  total_days_per_week: z.number().int(),
  environment: z.string(),
  schedule_days: z.array(singleSessionPlanSchema),
  recovery_days: z.array(z.string()).default([]),
  rationale: z.array(z.string()).default([]),
  language: z.string().default('en'),
});

const planValidationResultSchema = z.object({
  is_valid: z.boolean(),
  errors: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  safety_score: z.number(),
  repaired: z.boolean().default(false),
  medical_red_flags: z.array(z.string()).default([]),
});

const pythonWorkoutPlanResponseSchema = z.object({
  plan: weeklyWorkoutScheduleSchema,
  validation: planValidationResultSchema,
  trace_id: z.string(),
});

export interface PythonWorkoutPlannerDeps {
  client: PythonAiClient;
  timeoutMs?: number;
}

export class PythonWorkoutPlannerService implements IAiWorkoutPlanner {
  private readonly timeoutMs: number;

  constructor(private readonly deps: PythonWorkoutPlannerDeps) {
    this.timeoutMs = Math.min(deps.timeoutMs ?? 25_000, 28_000);
  }

  async generatePlan(input: GenerateAiWorkoutPlanInput): Promise<AiWorkoutPlanResult> {
    const requestId = `wp-gen-${crypto.randomUUID().slice(0, 8)}`;
    const payload = {
      user_id: input.userId,
      goal: input.goal,
      experience_level: input.experienceLevel,
      available_equipment: input.availableEquipment,
      days_per_week: input.daysPerWeek,
      session_duration_minutes: input.sessionDurationMinutes,
      environment: input.environment ?? 'gym',
      physical_limitations: input.physicalLimitations ?? [],
      target_muscles: input.targetMuscles ?? [],
      preferred_exercises: input.preferredExercises ?? [],
      excluded_exercises: input.excludedExercises ?? [],
      language: input.language ?? 'en',
    };

    try {
      const rawResponse = await this.deps.client.postJson({
        path: GENERATE_WORKOUT_PLAN_PATH,
        scope: WORKOUT_PLANNER_SCOPE,
        userId: input.userId,
        requestId,
        correlationId: currentCorrelationId(),
        body: payload,
        timeoutMs: this.timeoutMs,
      });
      markAiRequestDispatched();

      const parsed = pythonWorkoutPlanResponseSchema.parse(rawResponse);
      return {
        plan: parsed.plan,
        validation: {
          isValid: parsed.validation.is_valid,
          errors: parsed.validation.errors,
          warnings: parsed.validation.warnings,
          safetyScore: parsed.validation.safety_score,
          repaired: parsed.validation.repaired,
          medicalRedFlags: parsed.validation.medical_red_flags,
        },
        traceId: parsed.trace_id,
      };
    } catch (err: unknown) {
      if (err instanceof PythonAiError) {
        if (err.dispatched) markAiRequestDispatched();
        throw toPublicAiError(err, 'Unable to generate workout plan right now. Please try again shortly.');
      }
      if (err instanceof z.ZodError) {
        markAiRequestDispatched();
        throw new AppError(
          'internal',
          'INTERNAL_ERROR',
          'Generated workout plan failed contract validation.',
          { issues: err.issues },
        );
      }
      throw err;
    }
  }

  async adaptPlan(input: AdaptAiWorkoutPlanInput): Promise<AiWorkoutPlanResult> {
    const requestId = `wp-adapt-${crypto.randomUUID().slice(0, 8)}`;
    const payload = {
      user_id: input.userId,
      current_plan: input.currentPlan,
      missed_sessions: input.missedSessions ?? [],
      reduced_duration_minutes: input.reducedDurationMinutes ?? null,
      new_equipment: input.newEquipment ?? null,
      difficulty_feedback: input.difficultyFeedback ?? null,
      user_feedback: input.userFeedback ?? null,
      recovery_score: input.recoveryScore ?? null,
      language: input.language ?? 'en',
    };

    try {
      const rawResponse = await this.deps.client.postJson({
        path: ADAPT_WORKOUT_PLAN_PATH,
        scope: WORKOUT_PLANNER_SCOPE,
        userId: input.userId,
        requestId,
        correlationId: currentCorrelationId(),
        body: payload,
        timeoutMs: this.timeoutMs,
      });
      markAiRequestDispatched();

      const parsed = pythonWorkoutPlanResponseSchema.parse(rawResponse);
      return {
        plan: parsed.plan,
        validation: {
          isValid: parsed.validation.is_valid,
          errors: parsed.validation.errors,
          warnings: parsed.validation.warnings,
          safetyScore: parsed.validation.safety_score,
          repaired: parsed.validation.repaired,
          medicalRedFlags: parsed.validation.medical_red_flags,
        },
        traceId: parsed.trace_id,
      };
    } catch (err: unknown) {
      if (err instanceof PythonAiError) {
        if (err.dispatched) markAiRequestDispatched();
        throw toPublicAiError(err, 'Unable to adapt workout plan right now. Please try again shortly.');
      }
      if (err instanceof z.ZodError) {
        markAiRequestDispatched();
        throw new AppError('internal', 'INTERNAL_ERROR', 'Adapted workout plan failed contract validation.', {
          issues: err.issues,
        });
      }
      throw err;
    }
  }
}
