import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useDashboard } from '@/features/dashboard/hooks/use-dashboard';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { localDateKey } from '@/features/home/utils/home-overview';
import { workoutApi } from '../api/workout-api';
import { useWorkoutStore } from '../store/workoutStore';

/** Reuse the dashboard recommendation and existing plan API after an app restart. */
export function usePlannedWorkout() {
  const dashboard = useDashboard();
  const userId = useAuthStore((state) => state.user?.id);
  const planned = useWorkoutStore((state) => state.plannedSession);
  const status = useWorkoutStore((state) => state.todayStatus);
  const lastCompleted = useWorkoutStore((state) => state.lastCompleted);
  const planId = planned && !planned.isDraft ? planned.id : dashboard.data?.todayWorkout?.id;
  const query = useQuery({
    queryKey: ['dashboard', 'planned-workout', userId, planId],
    queryFn: () => workoutApi.getWorkoutPlanById(planId!),
    enabled: !!userId && !!planId && status === 'notStarted' && !planned?.isDraft,
  });

  useEffect(() => {
    if (
      status === 'completed' &&
      lastCompleted?.completedAt &&
      localDateKey(new Date(lastCompleted.completedAt)) !== localDateKey()
    ) {
      useWorkoutStore.setState({ todayStatus: 'notStarted' });
    }
  }, [status, lastCompleted]);

  useEffect(() => {
    if (status !== 'notStarted' || planned?.isDraft) return;
    if ((query.error as any)?.response?.status === 404) {
      useWorkoutStore.getState().setPlannedSession(null);
      return;
    }
    const plan = query.data;
    if (!plan) return;
    useWorkoutStore.setState((state) => ({
      catalog: [
        ...state.catalog.filter(
          (exercise) => !plan.exercises.some((item) => item.exerciseId === exercise.id),
        ),
        ...plan.exercises.map((exercise) => ({
          id: exercise.exerciseId,
          name: exercise.exerciseName,
          ...state.catalog.find((item) => item.id === exercise.exerciseId),
          muscle: exercise.primaryMuscle,
          equipment: exercise.equipment,
        })),
      ],
      plannedSession: {
        id: plan.id,
        title: plan.name,
        focus: plan.description ?? '',
        durationMin: plan.estimatedDurationMinutes ?? 0,
        intensity: plan.difficulty,
        exercises: plan.exercises.map((exercise) => ({
          exerciseId: exercise.exerciseId,
          sets: exercise.targetSets,
          reps: exercise.targetReps,
          restSec: exercise.restSeconds ?? 0,
          weight: 0,
        })),
      },
    }));
  }, [query.data, query.error, status, planned?.isDraft]);
}
