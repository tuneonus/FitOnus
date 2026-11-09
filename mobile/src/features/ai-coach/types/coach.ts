import type { RouteName } from '../../../app/navigation/routes';
import type { ChartPoint, DataSource } from '../../../shared/types/health';
import type { FoodItem, MealType } from '../../nutrition/types/nutrition';

export type ToolName =
'getTodayHealthData' |
'getWorkoutHistory' |
'getSleepHistory' |
'getWeightHistory' |
'getNutritionLogs' |
'getGoals' |
'getRecoveryScore' |
'createWorkoutPlan' |
'logWorkout' |
'logMeal' |
'updateWeight' |
'searchFood' |
'analyzeMealImage' |
'compareProgress' |
'generateWeeklyReport' |
'generateMonthlyReport';

export type MetricItem = {
  label: string;
  value: string;
  unit?: string;
  delta?: string;
  tone?: 'good' | 'warn' | 'bad' | 'neutral';
  source: DataSource;
};

export type ActionKind = 'logMeal' | 'logWorkout' | 'updateWeight' | 'createPlan' | 'updateGoal' | 'startWorkout';

export type ActionPayload =
{kind: 'logMeal';meal: MealType;items: FoodItem[];} |
{kind: 'logWorkout';exercise: string;sets: {weight: number;reps: number;}[];} |
{kind: 'updateWeight';value: number;} |
{kind: 'createPlan';} |
{kind: 'updateGoal';goalId: string;target: number;} |
{kind: 'startWorkout';};

export type ActionStatus = 'pending' | 'running' | 'confirmed' | 'cancelled' | 'undone' | 'failed';

export type Block =
{type: 'metrics';title: string;items: MetricItem[];} |
{type: 'workout';title: string;focus: string;durationMin: number;exercises: {name: string;detail: string;}[];} |
{
  type: 'nutrition';
  title: string;
  headline?: {value: string;label: string;};
  rows: {label: string;value: string;detail?: string;estimated?: boolean;}[];
  macros?: {label: string;value: number;goal: number;}[];
  note?: string;
} |
{
  type: 'chart';
  title: string;
  chart: 'line' | 'bar';
  points: ChartPoint[];
  unit: string;
  target?: number;
  targetLabel?: string;
  projection?: ChartPoint[];
  band?: {lower: number;upper: number;}[];
  caption: string;
  confidence?: 'low' | 'medium' | 'high';
  source: DataSource;
} |
{type: 'comparison';title: string;columns: [string, string];rows: {label: string;a: string;b: string;better: 'a' | 'b' | 'none';}[];} |
{type: 'action';id: string;title: string;summary: {label: string;value: string;estimated?: boolean;}[];payload: ActionPayload;status: ActionStatus;resultText?: string | undefined;} |
{type: 'link';label: string;description: string;route: RouteName;params?: Record<string, string>;};

export type CoachMessage = {
  id: string;
  role: 'user' | 'assistant';
  text?: string | undefined;
  blocks?: Block[] | undefined;
  followUps?: string[] | undefined;
  sources?: string[] | undefined;
  toolCalls?: ToolName[] | undefined;
  status: 'done' | 'thinking' | 'error';
  medicalNote?: boolean | undefined;
  memoryUsed?: string | undefined;
};

export type CoachResponse = Omit<CoachMessage, 'id' | 'role' | 'status'> & {
  conversationId?: string | undefined;
};

export type StoredChatMessage = {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  blocks?: Block[] | undefined;
  sources?: string[] | undefined;
  followUps?: string[] | undefined;
  createdAt: string;
};

export type ConversationDetail = {
  id: string;
  title: string;
  preview: string;
  messages: StoredChatMessage[];
  createdAt: string;
  updatedAt: string;
};

export type ConversationSummary = {
  id: string;
  title: string;
  preview: string;
  createdAt: string;
  updatedAt: string;
};

export type Conversation = {
  id: string;
  title: string;
  date: string;
  group: 'Today' | 'This week' | 'Earlier';
  preview: string;
  questions: string[];
};

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
