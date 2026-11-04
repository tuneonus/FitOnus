export type MealType = 'breakfast' | 'lunch' | 'snacks' | 'dinner';

export type EntryMethod = 'search' | 'photo' | 'barcode' | 'voice' | 'manual' | 'coach';

export type Nutrients = {
  kcal: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
};

export type FoodItem = Nutrients & {
  id: string;
  name: string;
  serving: string;
  brand?: string;
  /** Estimated values come from AI photo analysis or coach guesses. */
  estimated?: boolean;
  confidence?: number;
};

export type MealEntry = {
  id: string;
  meal: MealType;
  time: string;
  method: EntryMethod;
  items: FoodItem[];
};