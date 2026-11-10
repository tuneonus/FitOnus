import type { DashboardData } from '../../src/features/dashboard/api/dashboard-repository';

// Test-only data; never bundled by the app.
export const MOCK_DASHBOARD_DATA: DashboardData = {
  userDisplayName: 'Athlete',
  summary: {
    recoveryScore: 84,
    sleepScore: 92,
    sleepDuration: '7h 42m',
    steps: 8432,
    caloriesBurned: 2150,
    caloriesConsumed: 1800,
    activeMinutes: 45,
    waterIntake: 2.5,
    heartRate: 64,
    weight: 75.2,
  },
  aiSummary: {
    greeting: 'Good morning!',
    sleepInsights: 'You slept 7h 42m.',
    recoveryInsights: 'Recovery Score 84%.',
    recommendation: "Today's recommendation:\nChest + Triceps.",
  },
  todayWorkout: {
    id: 'w1',
    name: 'Upper Body Power',
    duration: 60,
    exercises: 8,
    estimatedCalories: 450,
  },
  nutrition: {
    calories: 1800,
    caloriesGoal: 2500,
    protein: 120,
    proteinGoal: 160,
    carbs: 200,
    carbsGoal: 250,
    fat: 55,
    fatGoal: 70,
  },
  progress: {
    dailyGoalProgress: 0.75,
    weeklyGoalProgress: 0.6,
  },
  recentActivity: [
    {
      id: 'a1',
      type: 'workout',
      title: 'Leg Day',
      subtitle: '45 mins • 320 kcal',
      timestamp: 'Yesterday',
    },
    {
      id: 'a2',
      type: 'meal',
      title: 'Chicken Salad',
      subtitle: '450 kcal • 40g Protein',
      timestamp: 'Yesterday',
    },
    {
      id: 'a3',
      type: 'weight',
      title: 'Logged Weight',
      subtitle: '75.2 kg',
      timestamp: '2 days ago',
    },
  ],
};
