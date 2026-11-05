import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { Button } from '../../../shared/components/ui/Button';
import { ProgressBar } from '../../../shared/components/ui/ProgressBar';
import { useHealthStore } from '../../health-integration/store/healthStore';
import { useProfileSetupStore, type ProfileSetup } from '../store/profileSetupStore';
import { onboardingSteps, OnboardingStepId } from '../constants/steps';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import {
  useSaveOnboardingStep,
  useCompleteOnboarding,
  useProfile,
} from '@/features/profile/hooks/use-profile';
import { useUpdateSettings } from '@/features/profile/hooks/use-settings';

function getStepPayload(stepId: OnboardingStepId, s: ProfileSetup): Record<string, unknown> {
  switch (stepId) {
    case 'intro':
      return {};
    case 'personal':
      return { name: s.name, sex: s.sex };
    case 'dob':
      return {
        dateOfBirth: `${s.dobYear}-${String(s.dobMonth).padStart(2, '0')}-${String(s.dobDay).padStart(2, '0')}`,
      };
    case 'height':
      return { heightCm: s.heightCm };
    case 'weight':
      return {
        weightKg: s.weightKg,
        targetWeightKg: s.goal === 'lose' ? 75 : s.goal === 'gain' ? s.weightKg + 4 : s.weightKg,
      };
    case 'experience':
      return { experience: s.experience };
    case 'goal':
      return { goal: s.goal };
    case 'workoutPreference':
      return {
        place: s.place,
        daysPerWeek: s.daysPerWeek,
        duration: s.durationMin,
      };
    case 'equipment':
      return { equipment: s.equipment };
    case 'duration':
      return { duration: s.durationMin };
    case 'food':
      return {
        dietType: s.diet,
        allergies: s.allergies,
        cuisines: s.cuisines,
      };
    case 'health':
      return { medicalConditions: [], injuries: [] };
    case 'device':
      return { smartwatch: s.deviceConnected, healthConnect: s.healthAllowed };
    case 'confirm':
      return {};
    default:
      return {};
  }
}
import {
  StepIntro,
  StepPersonal,
  StepDob,
  StepHeight,
  StepWeight,
  StepExperience,
  StepGoal,
  StepWorkoutPreference,
  StepEquipment,
  StepDuration,
  StepFood,
  StepHealthPermissions,
  StepDevice,
  StepSummary,
} from '../components/OnboardingSteps';
import { StepGoalConfirmation } from '../components/StepGoalConfirmation';
import { useTheme } from '@/hooks/use-theme';

export function OnboardingScreen() {
  const { colors } = useTheme();
  const { reset } = useNavigation();

  const [index, setIndex] = useState(0);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const profileSetup = useProfileSetupStore();
  const name = useProfileSetupStore((s) => s.name);
  const deviceConnected = useProfileSetupStore((s) => s.deviceConnected);
  const healthAllowed = useProfileSetupStore((s) => s.healthAllowed);
  const setHealthStatus = useHealthStore((s) => s.setStatus);

  const { mutate: saveStep } = useSaveOnboardingStep();
  const { mutateAsync: completeOnboardingAsync } = useCompleteOnboarding();
  const { mutate: updateSettings } = useUpdateSettings();
  const { data: serverProfile } = useProfile();

  React.useEffect(() => {
    if (
      isAuthenticated &&
      serverProfile?.currentOnboardingStep &&
      serverProfile.currentOnboardingStep !== 'done' &&
      serverProfile.currentOnboardingStep !== 'intro'
    ) {
      const stepIdx = onboardingSteps.findIndex((s) => s.id === serverProfile.currentOnboardingStep);
      if (stepIdx > 0 && index === 0) {
        setIndex(stepIdx);
      }
    }
  }, [isAuthenticated, serverProfile, index]);

  const step = (onboardingSteps[index] ?? onboardingSteps[0])!;
  const total = onboardingSteps.length;
  const isLast = index === total - 1;

  const handleNext = async () => {
    if (isAuthenticated) {
      const payload = getStepPayload(step.id, profileSetup);
      saveStep({ step: step.id, data: payload });

      if (step.id === 'health') {
        updateSettings({ healthConnectEnabled: healthAllowed });
      } else if (step.id === 'device') {
        updateSettings({ smartwatchConnected: deviceConnected });
      }
    }

    if (isLast) {
      if (isAuthenticated) {
        try {
          await completeOnboardingAsync();
        } catch {
          // Ignore duplicate or minor completion network warnings
        }
      }
      setHealthStatus(
        healthAllowed || deviceConnected ? 'synced' : 'noDevice'
      );
      reset('home');
    } else {
      setIndex(index + 1);
    }
  };

  const handleBack = () => {
    if (index > 0) {
      setIndex(index - 1);
    }
  };

  const handleSkip = () => {
    handleNext();
  };

  const goToStep = (id: string) => {
    const targetIdx = onboardingSteps.findIndex((s) => s.id === id);
    if (targetIdx >= 0) setIndex(targetIdx);
  };

  const renderStep = (id: OnboardingStepId) => {
    switch (id) {
      case 'intro':
        return <StepIntro />;
      case 'personal':
        return <StepPersonal />;
      case 'dob':
        return <StepDob />;
      case 'height':
        return <StepHeight />;
      case 'weight':
        return <StepWeight />;
      case 'experience':
        return <StepExperience />;
      case 'goal':
        return <StepGoal />;
      case 'workoutPreference':
        return <StepWorkoutPreference />;
      case 'equipment':
        return <StepEquipment />;
      case 'duration':
        return <StepDuration />;
      case 'food':
        return <StepFood />;
      case 'health':
        return <StepHealthPermissions />;
      case 'device':
        return <StepDevice />;
      case 'confirm':
        return <StepGoalConfirmation onEdit={goToStep} />;
      case 'done':
        return <StepSummary />;
      default:
        return null;
    }
  };

  const canContinue = step.id !== 'personal' || name.trim().length > 0;

  return (
    <Screen
      showBack={false}
      headerLeft={
        index > 0 ? (
          <TouchableOpacity
            onPress={handleBack}
            style={styles.backButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <ChevronLeft size={24} color={colors.ink} />
          </TouchableOpacity>
        ) : (
          <View style={{ width: 44 }} />
        )
      }
      headerRight={
        step.skippable ? (
          <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
            <Text style={[styles.skipText, { color: colors.muted }]}>Skip</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 44 }} />
        )
      }
      footer={
        <Button
          title={isLast ? 'Get started' : 'Continue'}
          size="lg"
          fullWidth
          disabled={!canContinue}
          onPress={handleNext}
        />
      }
    >
      <View style={styles.content}>
        {/* Progress Bar */}
        <ProgressBar
          value={(index + 1) / total}
          height={4}
          style={styles.progressBar}
        />

        <View style={styles.stepInfoRow}>
          <Text style={[styles.stepCount, { color: colors.muted }]}>
            Step {index + 1} of {total}
          </Text>
        </View>

        <Text style={[styles.title, { color: colors.ink }]}>{step.title}</Text>
        {step.subtitle ? (
          <Text style={[styles.subtitle, { color: colors.muted }]}>
            {step.subtitle}
          </Text>
        ) : null}

        <View style={styles.stepBody}>{renderStep(step.id)}</View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: 8,
    paddingTop: 4,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  skipText: {
    fontSize: 13.5,
    fontWeight: '600',
  },
  progressBar: {
    marginBottom: 12,
  },
  stepInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  stepCount: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  title: {
    fontSize: 26,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 14.5,
    lineHeight: 20,
    marginTop: 4,
  },
  stepBody: {
    marginTop: 20,
  },
});
