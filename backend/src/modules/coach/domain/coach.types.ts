export interface UserFitnessProfile {
  displayName: string;
  sex: string | null;
  age: number | null;
  heightCm: number | null;
  currentWeightKg: number | null;
  targetWeightKg: number | null;
  primaryGoal: string | null;
  experienceLevel: string | null;
  preferredWorkoutPlace: string | null;
  workoutDaysPerWeek: number | null;
  dietType: string | null;
  dailyCalorieTarget: number | null;
  dailyProteinGrams: number | null;
}

export interface TodayNutritionContext {
  caloriesConsumed: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  waterIntakeMl: number;
  calorieTarget: number | null;
  proteinTarget: number | null;
}

export interface RecentWorkoutContext {
  name: string;
  durationMinutes: number;
  volumeKg: number;
  totalSets: number;
  caloriesBurned: number | null;
  completedAt: string;
}

export interface ActiveGoalContext {
  title: string;
  category: string;
  targetValue: number;
  currentValue: number;
  unit: string;
}

export interface UserFitnessContext {
  profile: UserFitnessProfile;
  todayNutrition: TodayNutritionContext;
  recentWorkouts: RecentWorkoutContext[];
  todayPlannedWorkout: { name: string; durationMinutes: number; exercisesCount: number } | null;
  activeGoals: ActiveGoalContext[];
  latestWeightKg: number | null;
}

export type BlockType =
  | 'metrics'
  | 'workout'
  | 'nutrition'
  | 'chart'
  | 'comparison'
  | 'action'
  | 'link';

export interface MetricItem {
  label: string;
  value: string;
  unit?: string;
  delta?: string;
  tone?: 'good' | 'warn' | 'bad' | 'neutral';
  source?: {
    kind: 'synced' | 'estimated' | 'manual' | 'unavailable';
    label: string;
  };
}

export interface WorkoutBlockExercise {
  name: string;
  detail: string;
}

export interface NutritionRow {
  label: string;
  value: string;
  detail?: string;
  estimated?: boolean;
}

export interface NutritionMacro {
  label: string;
  value: number;
  goal: number;
}

export interface ChartPoint {
  label: string;
  value: number;
}

export interface ComparisonRow {
  label: string;
  a: string;
  b: string;
  better: 'a' | 'b' | 'none';
}

export interface ActionSummaryItem {
  label: string;
  value: string;
  estimated?: boolean;
}

export type ActionPayload =
  | { kind: 'logMeal'; meal: 'breakfast' | 'lunch' | 'dinner' | 'snack'; items: Array<{ id: string; name: string; serving: string; kcal: number; protein: number; carbs: number; fat: number }> }
  | { kind: 'logWorkout'; exercise: string; sets: Array<{ weight: number; reps: number }> }
  | { kind: 'updateWeight'; value: number }
  | { kind: 'createPlan' }
  | { kind: 'updateGoal'; goalId: string; target: number }
  | { kind: 'startWorkout' };

export type Block =
  | { type: 'metrics'; title: string; items: MetricItem[] }
  | { type: 'workout'; title: string; focus: string; durationMin: number; exercises: WorkoutBlockExercise[] }
  | {
      type: 'nutrition';
      title: string;
      headline?: { value: string; label: string };
      rows: NutritionRow[];
      macros?: NutritionMacro[];
      note?: string;
    }
  | {
      type: 'chart';
      title: string;
      chart: 'line' | 'bar';
      points: ChartPoint[];
      unit: string;
      caption: string;
      confidence?: 'low' | 'medium' | 'high';
      source: { kind: 'synced' | 'estimated' | 'manual' | 'unavailable'; label: string };
    }
  | { type: 'comparison'; title: string; columns: [string, string]; rows: ComparisonRow[] }
  | {
      type: 'action';
      id: string;
      title: string;
      summary: ActionSummaryItem[];
      payload: ActionPayload;
      status: 'pending' | 'running' | 'confirmed' | 'cancelled' | 'undone' | 'failed';
      resultText?: string;
    }
  | { type: 'link'; label: string; description: string; route: string; params?: Record<string, string> };

export interface CoachResponse {
  text: string;
  blocks?: Block[];
  followUps?: string[];
  sources?: string[];
  toolCalls?: string[];
  medicalNote?: boolean;
  memoryUsed?: string;
}

export interface ChatMessageTurn {
  role: 'user' | 'assistant';
  text: string;
}

export type InsightCategory = 'workout' | 'nutrition' | 'hydration' | 'goal' | 'recovery';
export type InsightPriority = 'high' | 'medium' | 'low';
export type InsightSeverity = 'positive' | 'watch' | 'info';

export interface CoachInsightItem {
  id: string;
  title: string;
  description: string;
  category: InsightCategory;
  priority: InsightPriority;
  severity: InsightSeverity;
  action: string;
  question: string;
  evidence: string[];
  confidence: 'high' | 'medium' | 'low';
  requiresDevice: boolean;
}

export interface CoachInsightsResponse {
  greeting: string;
  recommendation: string | null;
  insights: CoachInsightItem[];
  generatedAt: string;
  hasSufficientData: boolean;
}


