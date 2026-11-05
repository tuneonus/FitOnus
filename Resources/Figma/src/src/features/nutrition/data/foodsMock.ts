import type { FoodItem, MealEntry } from '../types/nutrition';

export const foodDatabase: FoodItem[] = [
{ id: 'f1', name: 'Paneer tikka', serving: '150 g', kcal: 330, protein: 24, carbs: 9, fat: 22, fiber: 2 },
{ id: 'f2', name: 'Chicken biryani', serving: '1 plate · 350 g', kcal: 720, protein: 32, carbs: 86, fat: 26, fiber: 3, estimated: true },
{ id: 'f3', name: 'Dal tadka', serving: '1 bowl · 200 g', kcal: 230, protein: 12, carbs: 30, fat: 7, fiber: 8 },
{ id: 'f4', name: 'Jeera rice', serving: '1 cup · 160 g', kcal: 260, protein: 5, carbs: 52, fat: 4, fiber: 1 },
{ id: 'f5', name: 'Greek yogurt, plain', serving: '170 g', brand: 'Epigamia', kcal: 140, protein: 15, carbs: 7, fat: 5, fiber: 0 },
{ id: 'f6', name: 'Whey protein isolate', serving: '1 scoop · 32 g', brand: 'MuscleBlaze', kcal: 120, protein: 27, carbs: 2, fat: 0.5, fiber: 0 },
{ id: 'f7', name: 'Masala oats', serving: '1 bowl', kcal: 290, protein: 12, carbs: 46, fat: 6, fiber: 6 },
{ id: 'f8', name: 'Boiled eggs', serving: '2 large', kcal: 130, protein: 13, carbs: 1, fat: 9, fiber: 0 },
{ id: 'f9', name: 'Banana', serving: '1 medium · 118 g', kcal: 105, protein: 1.3, carbs: 27, fat: 0.4, fiber: 3 },
{ id: 'f10', name: 'Grilled chicken breast', serving: '150 g', kcal: 248, protein: 46, carbs: 0, fat: 5, fiber: 0 },
{ id: 'f11', name: 'Roti, whole wheat', serving: '1 piece · 40 g', kcal: 120, protein: 4, carbs: 20, fat: 3, fiber: 3 },
{ id: 'f12', name: 'Almonds', serving: '28 g', kcal: 164, protein: 6, carbs: 6, fat: 14, fiber: 3.5 }];


export const recentFoodIds = ['f7', 'f8', 'f6', 'f5'];

export const barcodeProduct: FoodItem = {
  id: 'bc1',
  name: 'High Protein Bar · Peanut Butter',
  brand: 'RiteBite Max',
  serving: '1 bar · 70 g',
  kcal: 285,
  protein: 20,
  carbs: 27,
  fat: 10,
  fiber: 5
};

/** Mock result for analyzeMealImage(). All values are estimates. */
export const photoAnalysisItems: FoodItem[] = [
{ id: 'p1', name: 'Paneer tikka', serving: '6 pieces · ~150 g', kcal: 330, protein: 24, carbs: 9, fat: 22, fiber: 2, estimated: true, confidence: 0.92 },
{ id: 'p2', name: 'Jeera rice', serving: '~1 cup · 160 g', kcal: 260, protein: 5, carbs: 52, fat: 4, fiber: 1, estimated: true, confidence: 0.88 },
{ id: 'p3', name: 'Dal tadka', serving: '1 bowl · ~200 g', kcal: 230, protein: 12, carbs: 30, fat: 7, fiber: 8, estimated: true, confidence: 0.81 },
{ id: 'p4', name: 'Cucumber raita', serving: 'Small cup · ~100 g', kcal: 70, protein: 3, carbs: 6, fat: 3.5, fiber: 0.5, estimated: true, confidence: 0.64 }];


export const initialMealEntries: MealEntry[] = [
{
  id: 'm-today-1',
  meal: 'breakfast',
  time: '8:05 AM',
  method: 'search',
  items: [
  { ...foodDatabase[6], id: 'e1' },
  { ...foodDatabase[7], id: 'e2' }]

}];


export const mealHistory = [
{ date: 'Thu, Oct 8', kcal: 2210, protein: 132, meals: 4 },
{ date: 'Wed, Oct 7', kcal: 2480, protein: 121, meals: 4 },
{ date: 'Tue, Oct 6', kcal: 2140, protein: 146, meals: 3 },
{ date: 'Mon, Oct 5', kcal: 2290, protein: 104, meals: 4 },
{ date: 'Sun, Oct 4', kcal: 2860, protein: 98, meals: 5 },
{ date: 'Sat, Oct 3', kcal: 2710, protein: 112, meals: 4 }];