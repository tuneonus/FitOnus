import { create } from 'zustand';
import type { Goal } from '../types/goal';

const initialGoals: Goal[] = [
{ id: 'g1', type: 'weightLoss', title: 'Reach 75 kg', unit: 'kg', start: 84.2, current: 78.4, target: 75, deadline: 'Jan 31, 2027', status: 'active', cadence: 'once', history: [84.2, 83.5, 82.6, 82.1, 81.8, 81.9, 81.0, 80.4, 79.2, 78.4] },
{ id: 'g2', type: 'protein', title: '150 g protein daily', unit: 'g', start: 0, current: 118, target: 150, deadline: 'Ongoing', status: 'active', cadence: 'daily', history: [104, 146, 121, 132, 98, 112, 118], hitDays: 2 },
{ id: 'g3', type: 'steps', title: '10,000 steps daily', unit: 'steps', start: 0, current: 8830, target: 10000, deadline: 'Ongoing', status: 'active', cadence: 'daily', history: [11240, 7310, 8420, 9870, 6120, 10450, 2180], hitDays: 2 },
{ id: 'g4', type: 'streak', title: '7-day workout streak', unit: 'days', start: 0, current: 4, target: 7, deadline: 'Oct 12', status: 'active', cadence: 'streak', history: [1, 2, 0, 1, 2, 3, 4] },
{ id: 'g5', type: 'water', title: '3 L water daily', unit: 'L', start: 0, current: 2.4, target: 3, deadline: 'Ongoing', status: 'active', cadence: 'daily', history: [2.1, 2.8, 3.1, 2.2, 2.5, 2.4, 0.5], hitDays: 1 },
{ id: 'g6', type: 'run5k', title: 'Run 5K under 30 min', unit: 'min', start: 34, current: 28.7, target: 30, deadline: 'Sep 30', status: 'completed', cadence: 'once', history: [34, 32.5, 31.4, 30.2, 28.7], completedOn: 'Sep 12' },
{ id: 'g7', type: 'streak', title: '16 workouts in August', unit: 'sessions', start: 0, current: 16, target: 16, deadline: 'Aug 31', status: 'completed', cadence: 'once', history: [4, 8, 12, 16], completedOn: 'Aug 30' }];


type GoalsState = {
  goals: Goal[];
  addGoal: (goal: Omit<Goal, 'id'>) => string;
  updateGoal: (id: string, patch: Partial<Goal>) => void;
  deleteGoal: (id: string) => void;
  completeGoal: (id: string) => void;
};

export const useGoalsStore = create<GoalsState>((set, get) => ({
  goals: initialGoals,
  addGoal: (goal) => {
    const id = `g-${Date.now()}`;
    set({ goals: [{ ...goal, id }, ...get().goals] });
    return id;
  },
  updateGoal: (id, patch) => set({ goals: get().goals.map((g) => g.id === id ? { ...g, ...patch } : g) }),
  deleteGoal: (id) => set({ goals: get().goals.filter((g) => g.id !== id) }),
  completeGoal: (id) =>
  set({ goals: get().goals.map((g) => g.id === id ? { ...g, status: 'completed', completedOn: 'Oct 9' } : g) })
}));

export function goalProgress(goal: Goal) {
  if (goal.cadence === 'daily' || goal.cadence === 'streak') return Math.min(1, goal.current / goal.target);
  const total = goal.start - goal.target;
  if (total === 0) return 1;
  return Math.max(0, Math.min(1, (goal.start - goal.current) / total));
}