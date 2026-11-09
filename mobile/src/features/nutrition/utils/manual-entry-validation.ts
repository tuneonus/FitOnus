export type ManualFoodForm = {
  name: string;
  kcal: string;
  protein: string;
  carbs: string;
  fat: string;
};
export function manualFoodError(form: ManualFoodForm): string | null {
  if (!form.name.trim()) return 'Name the food before adding it.';
  const calories = Number(form.kcal);
  if (!Number.isFinite(calories) || calories <= 0)
    return 'Enter a calorie amount greater than zero.';
  for (const key of ['protein', 'carbs', 'fat'] as const) {
    const value = Number(form[key]);
    if (!Number.isFinite(value) || value < 0) return 'Macros must be zero or a positive number.';
  }
  return null;
}
