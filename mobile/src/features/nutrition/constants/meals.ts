import type { MealType, Nutrients } from '../types/nutrition';

export const mealLabels: Record<MealType, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  snacks: 'Snacks',
  dinner: 'Dinner'
};

export const mealOrder: MealType[] = ['breakfast', 'lunch', 'snacks', 'dinner'];

export const nutritionGoals: Nutrients = { kcal: 2350, protein: 150, carbs: 260, fat: 75, fiber: 32 };

export const macroMeta = [
{ key: 'protein' as const, label: 'Protein', barClass: 'bg-move' },
{ key: 'carbs' as const, label: 'Carbs', barClass: 'bg-sky' },
{ key: 'fat' as const, label: 'Fat', barClass: 'bg-warn' },
{ key: 'fiber' as const, label: 'Fiber', barClass: 'bg-accentStrong' }];