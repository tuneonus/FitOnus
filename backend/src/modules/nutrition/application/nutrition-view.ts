import type { Food, FoodDataSource, VerificationStatus } from '../domain/food.js';
import type { Meal, MealItem, MealType } from '../domain/meal.js';
import type { WaterIntake } from '../domain/water.js';
import type { CalculatedNutrients } from '../domain/nutrition-calculator.js';

export interface FoodView {
  id: string;
  name: string;
  brand: string | null;
  barcode: string | null;
  servingSize: number;
  servingUnit: string;
  servingWeightG: number;
  servingVolumeMl: number | null;
  densityGPerMl: number | null;
  servingBasis: '100g' | 'serving' | '100ml';
  referenceNutrients: {
    calories: number;
    proteinG: number;
    carbohydratesG: number;
    fatG: number;
    fiberG: number;
    sugarG: number;
    sodiumMg: number;
    cholesterolMg: number;
  };
  standardServingNutrients: CalculatedNutrients;
  isCustom: boolean;
  isVerified: boolean;
  isFavorite?: boolean;
}

export function toFoodView(food: Food, isFavorite?: boolean): FoodView {
  return {
    id: food.id,
    name: food.name,
    brand: food.brand,
    barcode: food.barcode,
    servingSize: food.servingSize,
    servingUnit: food.servingUnit,
    servingWeightG: food.servingWeightG,
    servingVolumeMl: food.servingVolumeMl,
    densityGPerMl: food.densityGPerMl,
    servingBasis: food.servingBasis,
    referenceNutrients: {
      calories: food.calories,
      proteinG: food.proteinG,
      carbohydratesG: food.carbohydratesG,
      fatG: food.fatG,
      fiberG: food.fiberG,
      sugarG: food.sugarG,
      sodiumMg: food.sodiumMg,
      cholesterolMg: food.cholesterolMg,
    },
    standardServingNutrients: food.getStandardServing(),
    isCustom: food.isCustom,
    isVerified: food.isVerified,
    isFavorite,
  };
}

export interface AdminFoodView extends FoodView {
  dataSource: FoodDataSource;
  sourceId: string | null;
  verificationStatus: VerificationStatus;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export function toAdminFoodView(food: Food): AdminFoodView {
  return {
    ...toFoodView(food),
    dataSource: food.dataSource,
    sourceId: food.sourceId,
    verificationStatus: food.verificationStatus,
    createdBy: food.createdBy,
    createdAt: food.createdAt.toISOString(),
    updatedAt: food.updatedAt.toISOString(),
    deletedAt: food.deletedAt ? food.deletedAt.toISOString() : null,
  };
}

export interface MealItemView {
  id: string;
  foodId: string | null;
  foodName: string;
  foodBrand: string | null;
  servingSize: number;
  servingUnit: string;
  servingWeightG: number;
  servingMultiplier: number;
  loggedWeightG: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fiberG: number;
}

export function toMealItemView(item: MealItem): MealItemView {
  return {
    id: item.id,
    foodId: item.foodId,
    foodName: item.foodName,
    foodBrand: item.foodBrand,
    servingSize: item.servingSize,
    servingUnit: item.servingUnit,
    servingWeightG: item.servingWeightG,
    servingMultiplier: item.servingMultiplier,
    loggedWeightG: item.loggedWeightG,
    calories: item.calories,
    proteinG: item.proteinG,
    carbsG: item.carbsG,
    fatG: item.fatG,
    fiberG: item.fiberG,
  };
}

export interface MealView {
  id: string;
  userId: string;
  mealType: MealType;
  date: string;
  totalCalories: number;
  totalProteinG: number;
  totalCarbsG: number;
  totalFatG: number;
  totalFiberG: number;
  notes: string | null;
  items: MealItemView[];
  createdAt: string;
  updatedAt: string;
}

export function toMealView(meal: Meal): MealView {
  return {
    id: meal.id,
    userId: meal.userId,
    mealType: meal.mealType,
    date: meal.date,
    totalCalories: meal.totalCalories,
    totalProteinG: meal.totalProteinG,
    totalCarbsG: meal.totalCarbsG,
    totalFatG: meal.totalFatG,
    totalFiberG: meal.totalFiberG,
    notes: meal.notes,
    items: meal.items.map(toMealItemView),
    createdAt: meal.createdAt.toISOString(),
    updatedAt: meal.updatedAt.toISOString(),
  };
}

export interface WaterIntakeView {
  id: string;
  userId: string;
  date: string;
  amountMl: number;
  loggedAt: string;
  createdAt: string;
}

export function toWaterIntakeView(water: WaterIntake): WaterIntakeView {
  return {
    id: water.id,
    userId: water.userId,
    date: water.date,
    amountMl: water.amountMl,
    loggedAt: water.loggedAt.toISOString(),
    createdAt: water.createdAt.toISOString(),
  };
}

export interface DailyNutritionView {
  date: string;
  targets: {
    calories: number | null;
    proteinG: number | null;
    carbsG: number | null;
    fatG: number | null;
    waterMl: number | null;
  } | null;
  consumed: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    fiberG: number;
    waterMl: number;
  };
  remaining: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    fiberG: number;
    waterMl: number;
  } | null;
  meals: MealView[];
}

export interface MacroSplitView {
  label: 'Protein' | 'Carbs' | 'Fat';
  pct: number;
  grams: number;
}

export interface DailyTrendPoint {
  date: string;
  label: string;
  value: number;
}

export interface NutritionAnalyticsView {
  range: 'week' | 'month';
  startDate: string;
  endDate: string;
  avgCalories: number;
  avgProtein: number;
  targetCalories: number | null;
  targetProtein: number | null;
  loggedDaysCount: number;
  totalDaysInRange: number;
  caloriesTrend: DailyTrendPoint[];
  proteinTrend: DailyTrendPoint[];
  macroSplit: MacroSplitView[];
  topFoods: { foodName: string; count: number; totalCalories: number }[];
}

