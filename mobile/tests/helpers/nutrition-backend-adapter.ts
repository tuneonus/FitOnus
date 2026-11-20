/**
 * A fake HTTP layer for the mobile nutrition tests that runs the REAL backend nutrition use cases and the REAL
 * request/response schemas behind an axios adapter, with in-memory repositories instead of PostgreSQL.
 *
 * Why it exists: a mock that returns canned JSON can only prove the mobile code agrees with itself. This one
 * enforces the backend's actual rules (a `foodId` must be a catalog food, an edit line may reference a stored
 * item, deleted meals disappear and restore whole, water ids are idempotent...), so a mobile payload the real
 * backend would reject fails here too. Nothing touches a database or the network.
 */
import crypto from 'node:crypto';
import { AppError } from '../../../backend/src/shared/errors/app-error';
import { Food } from '../../../backend/src/modules/nutrition/domain/food';
import type { Meal } from '../../../backend/src/modules/nutrition/domain/meal';
import type { WaterIntake } from '../../../backend/src/modules/nutrition/domain/water';
import { toFoodView } from '../../../backend/src/modules/nutrition/application/nutrition-view';
import { LogMealUseCase } from '../../../backend/src/modules/nutrition/application/use-cases/log-meal';
import { UpdateMealUseCase } from '../../../backend/src/modules/nutrition/application/use-cases/update-meal';
import { GetMealUseCase } from '../../../backend/src/modules/nutrition/application/use-cases/get-meal';
import { DeleteMealUseCase } from '../../../backend/src/modules/nutrition/application/use-cases/delete-meal';
import { RestoreMealUseCase } from '../../../backend/src/modules/nutrition/application/use-cases/restore-meal';
import { GetDailyNutritionUseCase } from '../../../backend/src/modules/nutrition/application/use-cases/get-daily-nutrition';
import { LogWaterUseCase } from '../../../backend/src/modules/nutrition/application/use-cases/log-water';
import { DeleteWaterUseCase } from '../../../backend/src/modules/nutrition/application/use-cases/delete-water';
import { SetWaterTargetUseCase } from '../../../backend/src/modules/nutrition/application/use-cases/set-water-target';
import { toNutritionTargets } from '../../../backend/src/modules/nutrition/infrastructure/pg-user-profile-target-adapter';
import {
  resolveDailyTargets,
  type DailyTargetsInput,
} from '../../../backend/src/modules/profile/domain/daily-targets';
import {
  dailyNutritionViewSchema,
  deleteMealResultSchema,
  deleteWaterResultSchema,
  foodViewSchema,
  getDailyNutritionRequest,
  logMealRequest,
  logWaterRequest,
  mealViewSchema,
  setWaterTargetRequest,
  waterTargetViewSchema,
  updateMealRequest,
  waterIntakeViewSchema,
} from '../../../backend/src/modules/nutrition/interface/nutrition.schemas';
import { mealPhotoResponseSchema } from '../../../backend/src/modules/nutrition/interface/meal-photo.schemas';

type AdapterConfig = {
  url?: string;
  method?: string;
  params?: Record<string, unknown>;
  data?: unknown;
};
type Handler = (
  match: RegExpMatchArray,
  config: AdapterConfig,
) => Promise<{ status?: number; data: unknown }>;

const STATUS_BY_CODE: Record<string, number> = {
  NOT_FOUND: 404,
  FORBIDDEN: 403,
  CONFLICT: 409,
  VALIDATION_FAILED: 400,
  BAD_REQUEST: 400,
  UNAUTHENTICATED: 401,
};

export interface FakeNutritionBackend {
  foods: Map<string, Food>;
  meals: Map<string, Meal>;
  water: Map<string, WaterIntake>;
  /** Every request the app made, in order, as "METHOD /path". */
  requests: string[];
  /** The member's profile facts and saved water target: what the REAL target resolver works from. */
  profile: DailyTargetsInput;
  /** What `POST /nutrition/meal-photo/analyze` answers (shape of the real Python-backed endpoint). */
  photoResponse: unknown;
  /** Makes the next request that matches answer with `status` (the data is untouched). */
  failNext(method: string, pattern: RegExp, status: number): void;
  addFood(food: Food): void;
  /** The `FoodView` JSON the real search endpoint would return for a food. */
  foodView(id: string): unknown;
  adapter: (config: AdapterConfig) => Promise<unknown>;
}

export function createFakeNutritionBackend(userId: string): FakeNutritionBackend {
  const foods = new Map<string, Food>();
  const meals = new Map<string, Meal>();
  const water = new Map<string, WaterIntake>();
  const requests: string[] = [];
  const failures: { method: string; pattern: RegExp; status: number }[] = [];

  const foodRepo = {
    findById: async (id: string, requestingUserId?: string | null) => {
      const food = foods.get(id);
      if (!food || food.deletedAt) return null;
      if (
        requestingUserId !== undefined &&
        !(food.isVerified || food.createdBy === requestingUserId)
      )
        return null;
      return food;
    },
  };

  const mealRepo = {
    findById: async (id: string, ownerId?: string, includeDeleted = false) => {
      const meal = meals.get(id);
      if (!meal) return null;
      if (ownerId && meal.userId !== ownerId) return null;
      if (meal.deletedAt && !includeDeleted) return null;
      return meal;
    },
    listByDate: async (ownerId: string, date: string) =>
      [...meals.values()].filter((m) => m.userId === ownerId && m.date === date && !m.deletedAt),
    create: async (meal: Meal) => {
      const existing = meals.get(meal.id);
      if (existing) return { meal: existing, created: false };
      meals.set(meal.id, meal);
      return { meal, created: true };
    },
    update: async (id: string, ownerId: string, meal: Meal) => {
      const existing = meals.get(id);
      if (!existing || existing.userId !== ownerId || existing.deletedAt) return null;
      meals.set(id, meal);
      return meal;
    },
    softDelete: async (id: string, ownerId: string) => {
      const meal = meals.get(id);
      if (!meal || meal.userId !== ownerId || meal.deletedAt) return false;
      meal.deletedAt = new Date();
      return true;
    },
    restore: async (id: string, ownerId: string) => {
      const meal = meals.get(id);
      if (!meal || meal.userId !== ownerId || !meal.deletedAt) return false;
      meal.deletedAt = null;
      return true;
    },
  };

  const waterRepo = {
    findById: async (id: string) => water.get(id) ?? null,
    create: async (entry: WaterIntake) => {
      const existing = water.get(entry.id);
      if (existing) return { entry: existing, created: false };
      water.set(entry.id, entry);
      return { entry, created: true };
    },
    delete: async (id: string, ownerId: string) => {
      const entry = water.get(id);
      if (!entry || entry.userId !== ownerId) return false;
      water.delete(id);
      return true;
    },
    listByDate: async (ownerId: string, date: string) =>
      [...water.values()]
        .filter((w) => w.userId === ownerId && w.date === date)
        .sort((a, b) => a.loggedAt.getTime() - b.loggedAt.getTime()),
    getTotalByDate: async (ownerId: string, date: string) =>
      [...water.values()]
        .filter((w) => w.userId === ownerId && w.date === date)
        .reduce((s, w) => s + w.amountMl, 0),
  };

  const uow = { run: async <T>(work: () => Promise<T>) => work() };
  // The profile the real resolver reads. A new member knows nothing (no weight, nothing saved), like a fresh account.
  const profile: DailyTargetsInput = {
    savedCalorieTarget: null,
    savedProteinGrams: null,
    savedWaterTargetMl: null,
    weightKg: null,
    heightCm: null,
    age: null,
    sex: null,
    primaryGoal: null,
    workoutDaysPerWeek: null,
  };
  const targets = { findTargetsByUserId: async () => toNutritionTargets(resolveDailyTargets(profile)) };
  const settings = {
    saveWaterTarget: async (_userId: string, targetMl: number | null) => {
      profile.savedWaterTargetMl = targetMl;
    },
  };

  const logMeal = new LogMealUseCase(mealRepo as never, foodRepo as never, uow as never);
  const updateMeal = new UpdateMealUseCase(mealRepo as never, foodRepo as never, uow as never);
  const getMeal = new GetMealUseCase(mealRepo as never);
  const deleteMeal = new DeleteMealUseCase(mealRepo as never);
  const restoreMeal = new RestoreMealUseCase(mealRepo as never);
  const getDaily = new GetDailyNutritionUseCase(
    mealRepo as never,
    waterRepo as never,
    targets as never,
  );
  const logWater = new LogWaterUseCase(waterRepo as never);
  const deleteWater = new DeleteWaterUseCase(waterRepo as never);
  const setWaterTarget = new SetWaterTargetUseCase(settings as never, targets as never);

  const backend: FakeNutritionBackend = {
    foods,
    meals,
    water,
    requests,
    profile,
    photoResponse: null,
    failNext: (method, pattern, status) =>
      failures.push({ method: method.toLowerCase(), pattern, status }),
    addFood: (food) => foods.set(food.id, food),
    foodView: (id) => foodViewSchema.parse(toFoodView(foods.get(id)!)),
    adapter: async () => undefined,
  };

  const routes: { method: string; pattern: RegExp; handle: Handler }[] = [
    {
      method: 'get',
      pattern: /^\/nutrition\/daily$/,
      handle: async (_m, config) => {
        const query = getDailyNutritionRequest.query.parse(config.params ?? {});
        const view = await getDaily.execute({ userId, date: query.date });
        return { data: dailyNutritionViewSchema.parse(view) };
      },
    },
    {
      method: 'post',
      pattern: /^\/nutrition\/meals$/,
      handle: async (_m, config) => {
        const body = logMealRequest.body.parse(JSON.parse(String(config.data)));
        const result = await logMeal.execute({ userId, ...body });
        return { status: result.created ? 201 : 200, data: mealViewSchema.parse(result.meal) };
      },
    },
    {
      method: 'put',
      pattern: /^\/nutrition\/meals\/([^/]+)$/,
      handle: async (match, config) => {
        const params = updateMealRequest.params.parse({ id: match[1] });
        const body = updateMealRequest.body.parse(JSON.parse(String(config.data)));
        const view = await updateMeal.execute({ userId, id: params.id, ...body });
        return { data: mealViewSchema.parse(view) };
      },
    },
    {
      method: 'get',
      pattern: /^\/nutrition\/meals\/([^/]+)$/,
      handle: async (match) => ({
        data: mealViewSchema.parse(await getMeal.execute(userId, match[1]!)),
      }),
    },
    {
      method: 'delete',
      pattern: /^\/nutrition\/meals\/([^/]+)$/,
      handle: async (match) => {
        const result = await deleteMeal.execute({ userId, id: match[1]! });
        return { data: deleteMealResultSchema.parse({ id: result.id, deleted: true }) };
      },
    },
    {
      method: 'post',
      pattern: /^\/nutrition\/meals\/([^/]+)\/restore$/,
      handle: async (match) => {
        const result = await restoreMeal.execute({ userId, id: match[1]! });
        return { data: mealViewSchema.parse(result.meal) };
      },
    },
    {
      method: 'post',
      pattern: /^\/nutrition\/water$/,
      handle: async (_m, config) => {
        const body = logWaterRequest.body.parse(JSON.parse(String(config.data)));
        const result = await logWater.execute({
          userId,
          id: body.id,
          date: body.date,
          amountMl: body.amountMl,
          loggedAt: body.loggedAt ? new Date(body.loggedAt) : undefined,
        });
        return {
          status: result.created ? 201 : 200,
          data: waterIntakeViewSchema.parse(result.entry),
        };
      },
    },
    {
      method: 'put',
      pattern: /^\/nutrition\/water-target$/,
      handle: async (_m, config) => {
        const body = setWaterTargetRequest.body.parse(JSON.parse(String(config.data)));
        const result = await setWaterTarget.execute({ userId, targetMl: body.targetMl });
        return { data: waterTargetViewSchema.parse(result) };
      },
    },
    {
      method: 'delete',
      pattern: /^\/nutrition\/water\/([^/]+)$/,
      handle: async (match) => {
        const result = await deleteWater.execute({ userId, id: match[1]! });
        return { data: deleteWaterResultSchema.parse({ id: result.id, deleted: true }) };
      },
    },
    {
      method: 'post',
      pattern: /^\/nutrition\/meal-photo\/analyze$/,
      handle: async () => ({ data: mealPhotoResponseSchema.parse(backend.photoResponse) }),
    },
  ];

  backend.adapter = async (config) => {
    const method = (config.method ?? 'get').toLowerCase();
    const url = (config.url ?? '').split('?')[0]!;
    requests.push(`${method.toUpperCase()} ${url}`);

    const respond = (status: number, data: unknown) => ({
      config,
      status,
      statusText: String(status),
      headers: {},
      data,
    });
    const fail = (status: number, code: string, message: string) => {
      throw Object.assign(new Error(message), {
        isAxiosError: true,
        config,
        response: respond(status, { success: false, error: { code, message } }),
      });
    };

    const injected = failures.findIndex((f) => f.method === method && f.pattern.test(url));
    if (injected >= 0) {
      const { status } = failures.splice(injected, 1)[0]!;
      return fail(status, status === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR', `Injected ${status}`);
    }

    const route = routes.find((r) => r.method === method && r.pattern.test(url));
    if (!route)
      return fail(404, 'ROUTE_NOT_FOUND', `No fake route for ${method.toUpperCase()} ${url}`);

    try {
      const { status = 200, data } = await route.handle(url.match(route.pattern)!, config);
      return respond(status, { success: true, data, message: 'ok' });
    } catch (error) {
      if (error instanceof AppError) {
        return fail(STATUS_BY_CODE[error.code] ?? 400, error.code, error.message);
      }
      if ((error as { name?: string })?.name === 'ZodError') {
        return fail(
          400,
          'VALIDATION_FAILED',
          `Request rejected by the backend schema: ${String(error)}`,
        );
      }
      throw error;
    }
  };

  return backend;
}

/** A deterministic uuid-shaped id for fixtures (valid for the backend's uuid schemas). */
export const fixtureId = (n: number) => `f0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const randomUuid = () => crypto.randomUUID();
