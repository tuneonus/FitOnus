/**
 * Backend AI tool contracts (function-calling schema targets).
 * The production backend (Fastify/NestJS + Supabase) will implement these;
 * the prototype uses ./mockAiTools.ts. UI code depends only on this interface.
 */
import type { ChartPoint } from '../../../shared/types/health';
import type { FoodItem, MealEntry, MealType } from '../../nutrition/types/nutrition';
import type { WorkoutLog, WorkoutSession } from '../../workouts/types/workout';
import type { WeightEntry } from '../../weight-tracking/types/weight';
import type { Goal } from '../../goals/types/goal';

export type TodayHealthData = {
  date: string;
  steps: number | null;
  activeCalories: number | null;
  restingHeartRate: number | null;
  hrvMs: number | null;
  sleepMinutes: number | null;
  sources: Record<string, 'synced' | 'estimated' | 'manual' | 'unavailable'>;
  lastSync: string | null;
};

export type RecoveryScore = {
  score: number | null;
  recommendation: 'trainHard' | 'moderate' | 'rest' | null;
  inputs: {key: string;label: string;value: string;impact: 'positive' | 'neutral' | 'negative';}[];
};

export type SleepNight = {date: string;minutes: number;deepMin: number;remMin: number;awakeMin: number;score: number;};

export type ProgressComparison = {
  periodA: string;
  periodB: string;
  metrics: {key: string;a: number;b: number;unit: string;}[];
};

export type AiReport = {id: string;period: string;highlights: string[];series: Record<string, ChartPoint[]>;};

export interface AiToolContracts {
  getTodayHealthData(): Promise<TodayHealthData>;
  getWorkoutHistory(params: {days: number;}): Promise<WorkoutLog[]>;
  getSleepHistory(params: {days: number;}): Promise<SleepNight[]>;
  getWeightHistory(params: {days: number;}): Promise<WeightEntry[]>;
  getNutritionLogs(params: {date: string;}): Promise<MealEntry[]>;
  getGoals(): Promise<Goal[]>;
  getRecoveryScore(params: {date: string;}): Promise<RecoveryScore>;
  createWorkoutPlan(params: {goal: string;durationMin: number;equipment: string[];recovery?: number;}): Promise<WorkoutSession>;
  logWorkout(params: {title: string;exercises: {name: string;sets: {weight: number;reps: number;}[];}[];}): Promise<{id: string;}>;
  logMeal(params: {meal: MealType;items: FoodItem[];}): Promise<{id: string;}>;
  updateWeight(params: {valueKg: number;date: string;}): Promise<{id: string;}>;
  searchFood(params: {query: string;}): Promise<FoodItem[]>;
  analyzeMealImage(params: {imageUri: string;}): Promise<{items: FoodItem[];overallConfidence: number;}>;
  compareProgress(params: {periodA: string;periodB: string;}): Promise<ProgressComparison>;
  generateWeeklyReport(params: {weekOf: string;}): Promise<AiReport>;
  generateMonthlyReport(params: {month: string;}): Promise<AiReport>;
}

export const toolLabels: Record<keyof AiToolContracts, string> = {
  getTodayHealthData: 'Reading today’s health data',
  getWorkoutHistory: 'Checking workout history',
  getSleepHistory: 'Reviewing sleep history',
  getWeightHistory: 'Loading weight trend',
  getNutritionLogs: 'Reading nutrition logs',
  getGoals: 'Checking your goals',
  getRecoveryScore: 'Calculating recovery',
  createWorkoutPlan: 'Building workout plan',
  logWorkout: 'Preparing workout log',
  logMeal: 'Preparing meal entry',
  updateWeight: 'Preparing weight update',
  searchFood: 'Searching food database',
  analyzeMealImage: 'Analyzing meal photo',
  compareProgress: 'Comparing periods',
  generateWeeklyReport: 'Generating weekly report',
  generateMonthlyReport: 'Generating monthly report'
};