import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import { profileApi } from '../api/profile-api';
import type {
  UserProfileView,
  UpdateProfilePayload,
  OnboardingStep,
  OnboardingCompleteView,
} from '../types/profile';
import { refreshFitnessQueries } from '@/services/fitness-refresh';
import { useProfileSetupStore } from '@/features/onboarding/store/profileSetupStore';

export const PROFILE_QUERY_KEY = ['profile', 'me'] as const;

export function syncStoreWithProfile(p: UserProfileView) {
  let dobDay = 1;
  let dobMonth = 1;
  let dobYear = 2000;
  if (p.dateOfBirth) {
    const parts = p.dateOfBirth.split('-').map(Number);
    if (parts.length === 3 && parts[0] && parts[1] && parts[2]) {
      dobYear = parts[0];
      dobMonth = parts[1];
      dobDay = parts[2];
    }
  }

  useProfileSetupStore.getState().update({
    name: p.name || useProfileSetupStore.getState().name,
    sex: p.sex || 'unspecified',
    dobDay,
    dobMonth,
    dobYear,
    heightCm: p.heightCm ?? 0,
    weightKg: p.currentWeightKg ?? 0,
    experience: p.experienceLevel ?? useProfileSetupStore.getState().experience,
    goal: p.primaryGoal ?? useProfileSetupStore.getState().goal,
    place: p.preferredWorkoutPlace ?? useProfileSetupStore.getState().place,
    daysPerWeek: p.workoutDaysPerWeek ?? useProfileSetupStore.getState().daysPerWeek,
    durationMin: p.preferredWorkoutDurationMin ?? useProfileSetupStore.getState().durationMin,
    equipment:
      p.availableEquipment.length > 0
        ? [...p.availableEquipment]
        : useProfileSetupStore.getState().equipment,
    diet: p.dietType ?? useProfileSetupStore.getState().diet,
    allergies: [...p.allergies],
    cuisines:
      p.preferredCuisines.length > 0
        ? [...p.preferredCuisines]
        : useProfileSetupStore.getState().cuisines,
  });
}

export function useProfile() {
  const userId = useAuthStore((s) => s.user?.id);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  return useQuery<UserProfileView>({
    queryKey: [...PROFILE_QUERY_KEY, userId],
    queryFn: async () => {
      const profile = await profileApi.getProfile();
      syncStoreWithProfile(profile);
      return profile;
    },
    enabled: isAuthenticated,
    staleTime: 0,
    refetchOnMount: 'always',
    retry: 2,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation<UserProfileView, Error, UpdateProfilePayload>({
    mutationFn: (payload) => profileApi.updateProfile(payload),
    onSuccess: (updated) => {
      queryClient.setQueryData([...PROFILE_QUERY_KEY, useAuthStore.getState().user?.id], updated);
      syncStoreWithProfile(updated);
      refreshFitnessQueries();
      queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
    },
  });
}

export function useSaveOnboardingStep() {
  const queryClient = useQueryClient();

  return useMutation<
    UserProfileView,
    Error,
    { step: OnboardingStep; data: Record<string, unknown> }
  >({
    mutationFn: ({ step, data }) => profileApi.saveOnboardingStep(step, data),
    onSuccess: (updated) => {
      queryClient.setQueryData([...PROFILE_QUERY_KEY, useAuthStore.getState().user?.id], updated);
      syncStoreWithProfile(updated);
      refreshFitnessQueries();
    },
  });
}

export function useCompleteOnboarding() {
  const queryClient = useQueryClient();

  return useMutation<OnboardingCompleteView, Error, void>({
    mutationFn: () => profileApi.completeOnboarding(),
    onSuccess: () => {
      refreshFitnessQueries();
      queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY });
    },
  });
}
