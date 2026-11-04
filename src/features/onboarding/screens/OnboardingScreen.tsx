import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { ChevronLeft } from 'lucide-react-native';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Screen } from '../../../shared/components/ui/Screen';
import { Button } from '../../../shared/components/ui/Button';
import { ProgressBar } from '../../../shared/components/ui/ProgressBar';
import { useHealthStore } from '../../health-integration/store/healthStore';
import { useProfileSetupStore } from '../store/profileSetupStore';
import { onboardingSteps, OnboardingStepId } from '../constants/steps';
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
  const name = useProfileSetupStore((s) => s.name);
  const deviceConnected = useProfileSetupStore((s) => s.deviceConnected);
  const healthAllowed = useProfileSetupStore((s) => s.healthAllowed);
  const setHealthStatus = useHealthStore((s) => s.setStatus);

  const step = (onboardingSteps[index] ?? onboardingSteps[0])!;
  const total = onboardingSteps.length;
  const isLast = index === total - 1;

  const handleNext = () => {
    if (isLast) {
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
