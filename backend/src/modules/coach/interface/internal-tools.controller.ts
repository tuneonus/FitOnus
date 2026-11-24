import type { Request } from 'express';
import { requireActor } from '../../../middleware/authenticate.js';
import { getValidated } from '../../../middleware/validate.js';
import type { RouteResult } from '../../../shared/http/route.js';
import type { IExerciseRepository, IPersonalRecordRepository, IWorkoutSessionRepository } from '../../workouts/index.js';
import type { IMealRepository, IUserProfileTargetPort, IWaterRepository } from '../../nutrition/index.js';
import type { IWeightRepository } from '../../progress/index.js';
import type { KnowledgeCategory, KnowledgeService } from '../../knowledge/index.js';
import type { ProfileWithIdentity } from '../../profile/index.js';
import {
  getExerciseDetailsInputSchema,
  getFitnessProfileInputSchema,
  getNutritionSummaryInputSchema,
  getRecentWorkoutsInputSchema,
  getWeightTrendInputSchema,
  retrieveFitnessKnowledgeInputSchema,
  searchExercisesInputSchema,
  type GetExerciseDetailsResponseDto,
  type GetFitnessProfileResponseDto,
  type GetNutritionSummaryResponseDto,
  type GetRecentWorkoutsResponseDto,
  type GetWeightTrendResponseDto,
  type RetrieveFitnessKnowledgeResponseDto,
  type SearchExercisesResponseDto,
} from './internal-tools.schemas.js';

export interface InternalToolsController {
  getRecentWorkouts(req: Request): Promise<RouteResult<GetRecentWorkoutsResponseDto>>;
  getNutritionSummary(req: Request): Promise<RouteResult<GetNutritionSummaryResponseDto>>;
  getWeightTrend(req: Request): Promise<RouteResult<GetWeightTrendResponseDto>>;
  searchExercises(req: Request): Promise<RouteResult<SearchExercisesResponseDto>>;
  getExerciseDetails(req: Request): Promise<RouteResult<GetExerciseDetailsResponseDto>>;
  getFitnessProfile(req: Request): Promise<RouteResult<GetFitnessProfileResponseDto>>;
  retrieveFitnessKnowledge(req: Request): Promise<RouteResult<RetrieveFitnessKnowledgeResponseDto>>;
}

export interface InternalToolsControllerDeps {
  sessionRepo: IWorkoutSessionRepository;
  personalRecordRepo: IPersonalRecordRepository;
  exerciseRepo: IExerciseRepository;
  mealRepo: IMealRepository;
  waterRepo: IWaterRepository;
  targetAdapter: IUserProfileTargetPort;
  weightRepo: IWeightRepository;
  knowledgeService?: KnowledgeService;
  profileRepo?: {
    ensureProfile(userId: string): Promise<ProfileWithIdentity>;
  };
}

export function createInternalToolsController(deps: InternalToolsControllerDeps): InternalToolsController {
  return {
    async getRecentWorkouts(req: Request): Promise<RouteResult<GetRecentWorkoutsResponseDto>> {
      const actor = requireActor(req);
      const validated = getValidated(req, { body: getRecentWorkoutsInputSchema });
      const days = validated.body.days ?? 7;

      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const [sessionsResult, prs] = await Promise.all([
        deps.sessionRepo.listForUser(actor.userId, { startDate, offset: 0, limit: 10 }),
        deps.personalRecordRepo.listCurrentBests(actor.userId),
      ]);

      const workouts = sessionsResult.sessions.map((s) => ({
        id: s.id,
        name: s.workoutName,
        durationMinutes: Math.round(s.durationSeconds / 60),
        totalVolumeKg: Math.round(s.totalVolumeKg),
        totalSets: s.totalSets,
        caloriesBurned: s.caloriesBurned ?? null,
        completedAt: s.completedAt.toISOString(),
      }));

      const personalRecords = prs.slice(0, 10).map((pr) => ({
        exerciseId: pr.exerciseId,
        recordType: pr.recordType,
        weightKg: pr.weightKg,
        reps: pr.reps,
        achievedAt: pr.achievedAt.toISOString(),
      }));

      return {
        data: { workouts, personalRecords },
        message: 'Recent workouts retrieved successfully',
      };
    },

    async getNutritionSummary(req: Request): Promise<RouteResult<GetNutritionSummaryResponseDto>> {
      const actor = requireActor(req);
      const validated = getValidated(req, { body: getNutritionSummaryInputSchema });
      const { date, days = 7 } = validated.body;

      // Determine date range: if specific date given, query that date; otherwise last N days up to today
      let startDateStr: string;
      let endDateStr: string;

      if (date) {
        startDateStr = date;
        endDateStr = date;
      } else {
        const end = new Date();
        const start = new Date(end);
        start.setDate(start.getDate() - (days - 1));
        startDateStr = start.toISOString().slice(0, 10);
        endDateStr = end.toISOString().slice(0, 10);
      }

      const [meals, waterTotals, targets] = await Promise.all([
        deps.mealRepo.listDateRange(actor.userId, startDateStr, endDateStr),
        deps.waterRepo.getTotalDateRange(actor.userId, startDateStr, endDateStr),
        deps.targetAdapter.findTargetsByUserId(actor.userId),
      ]);

      // Group meals by date
      const mealsByDate = new Map<string, { calories: number; protein: number; carbs: number; fat: number; count: number }>();
      for (const meal of meals) {
        const d = typeof meal.date === 'string' ? meal.date : new Date(meal.date).toISOString().slice(0, 10);
        const existing = mealsByDate.get(d) ?? { calories: 0, protein: 0, carbs: 0, fat: 0, count: 0 };
        existing.calories += meal.totalCalories;
        existing.protein += meal.totalProteinG;
        existing.carbs += meal.totalCarbsG;
        existing.fat += meal.totalFatG;
        existing.count += 1;
        mealsByDate.set(d, existing);
      }

      const waterByDate = new Map<string, number>();
      for (const w of waterTotals) {
        waterByDate.set(w.date, w.totalMl);
      }

      // Collect all dates in range
      const datesSet = new Set<string>([...mealsByDate.keys(), ...waterByDate.keys()]);
      if (datesSet.size === 0) {
        datesSet.add(endDateStr);
      }

      const sortedDates = Array.from(datesSet).sort();
      const daysSummary = sortedDates.map((d) => {
        const m = mealsByDate.get(d) ?? { calories: 0, protein: 0, carbs: 0, fat: 0, count: 0 };
        const waterMl = waterByDate.get(d) ?? 0;
        return {
          date: d,
          calories: Math.round(m.calories),
          proteinG: Math.round(m.protein),
          carbsG: Math.round(m.carbs),
          fatG: Math.round(m.fat),
          waterMl,
          mealCount: m.count,
        };
      });

      return {
        data: {
          days: daysSummary,
          targets: {
            calories: targets.calories,
            proteinG: targets.proteinG,
            carbsG: targets.carbsG,
            fatG: targets.fatG,
            waterMl: targets.waterMl,
          },
        },
        message: 'Nutrition summary retrieved successfully',
      };
    },

    async getWeightTrend(req: Request): Promise<RouteResult<GetWeightTrendResponseDto>> {
      const actor = requireActor(req);
      const validated = getValidated(req, { body: getWeightTrendInputSchema });
      const days = validated.body.days ?? 30;

      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const [summary, logsResult] = await Promise.all([
        deps.weightRepo.getUserWeightSummary(actor.userId),
        deps.weightRepo.listForUser(actor.userId, { startDate, offset: 0, limit: 30 }),
      ]);

      const logs = logsResult.logs.map((l) => ({
        date: l.loggedAt.toISOString().slice(0, 10),
        weightKg: Number(l.weightKg),
      }));

      return {
        data: {
          summary: {
            currentWeightKg: summary.currentWeightKg,
            targetWeightKg: summary.targetWeightKg,
            startingWeightKg: summary.startingWeightKg,
          },
          logs,
        },
        message: 'Weight trend retrieved successfully',
      };
    },

    async searchExercises(req: Request): Promise<RouteResult<SearchExercisesResponseDto>> {
      requireActor(req); // Enforces authenticated service caller
      const validated = getValidated(req, { body: searchExercisesInputSchema });
      const { query, muscle, equipment, limit = 5 } = validated.body;

      const result = await deps.exerciseRepo.list({
        search: query,
        muscle,
        equipment,
        offset: 0,
        limit,
      });

      const exercises = result.exercises.map((e) => ({
        id: e.id,
        name: e.name,
        targetMuscle: e.primaryMuscles[0] || 'general',
        secondaryMuscles: Array.from(e.secondaryMuscles),
        equipment: e.equipment,
        category: e.category,
        difficulty: e.difficulty,
      }));

      return {
        data: { exercises, total: result.total },
        message: 'Exercises retrieved successfully',
      };
    },

    async getExerciseDetails(req: Request): Promise<RouteResult<GetExerciseDetailsResponseDto>> {
      requireActor(req);
      const validated = getValidated(req, { body: getExerciseDetailsInputSchema });
      const exercise = await deps.exerciseRepo.findById(validated.body.exerciseId);

      if (!exercise) {
        return {
          data: { exercise: null },
          message: 'Exercise not found',
        };
      }

      return {
        data: {
          exercise: {
            id: exercise.id,
            name: exercise.name,
            description: exercise.description,
            targetMuscle: exercise.primaryMuscles[0] || 'general',
            secondaryMuscles: Array.from(exercise.secondaryMuscles),
            equipment: exercise.equipment,
            category: exercise.category,
            difficulty: exercise.difficulty,
            instructions: Array.from(exercise.instructions),
            tips: Array.from(exercise.tips),
            isCompound: exercise.isCompound,
          },
        },
        message: 'Exercise details retrieved successfully',
      };
    },

    async getFitnessProfile(req: Request): Promise<RouteResult<GetFitnessProfileResponseDto>> {
      const actor = requireActor(req);
      getValidated(req, { body: getFitnessProfileInputSchema });
      const [targets, weightSummary, profileData] = await Promise.all([
        deps.targetAdapter.findTargetsByUserId(actor.userId),
        deps.weightRepo.getUserWeightSummary(actor.userId),
        deps.profileRepo ? deps.profileRepo.ensureProfile(actor.userId) : Promise.resolve(null),
      ]);

      const prof = profileData?.profile;

      return {
        data: {
          profile: {
            userId: actor.userId,
            primaryGoal: prof?.primaryGoal ?? null,
            experienceLevel: prof?.experienceLevel ?? null,
            preferredWorkoutPlace: prof?.preferredWorkoutPlace ?? null,
            workoutDaysPerWeek: prof?.workoutDaysPerWeek ?? null,
            preferredWorkoutDurationMin: prof?.preferredWorkoutDurationMin ?? null,
            availableEquipment: prof ? Array.from(prof.availableEquipment) : [],
            dietType: prof?.dietType ?? null,
            allergies: prof ? Array.from(prof.allergies) : [],
            currentWeightKg: weightSummary.currentWeightKg ?? null,
            targetWeightKg: weightSummary.targetWeightKg ?? null,
            targets: {
              calories: targets.calories,
              proteinG: targets.proteinG,
              carbsG: targets.carbsG,
              fatG: targets.fatG,
              waterMl: targets.waterMl,
            },
          },
        },
        message: 'Fitness profile retrieved successfully',
      };
    },

    async retrieveFitnessKnowledge(req: Request): Promise<RouteResult<RetrieveFitnessKnowledgeResponseDto>> {
      requireActor(req);
      const validated = getValidated(req, { body: retrieveFitnessKnowledgeInputSchema });
      const { query, category, limit = 3 } = validated.body;

      if (!deps.knowledgeService) {
        return {
          data: { chunks: [] },
          message: 'Knowledge service not configured',
        };
      }

      const similar = await deps.knowledgeService.searchSimilar(query, {
        limit,
        ...(category ? { category: category as KnowledgeCategory } : {}),
      });

      const chunks = similar.map((c) => ({
        chunkId: c.id,
        category: c.documentCategory,
        content: c.content,
        similarity: c.similarity,
        title: c.documentTitle,
      }));

      return {
        data: { chunks },
        message: 'Fitness knowledge retrieved successfully',
      };
    },
  };
}

