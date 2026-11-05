import React, { useState } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { router } from 'expo-router';
import { ScreenContainer } from '@/components/shared/screen-container';
import { Text } from '@/components/ui/text';
import { Button } from '@/components/ui/button';
import { Spacing } from '@/constants/theme';
import { useAppStore } from '@/stores/app-store';

const { width } = Dimensions.get('window');

const ONBOARDING_STEPS = [
  {
    title: 'Welcome to FitOnus',
    description: 'Your personal AI-powered fitness and health companion.',
  },
  {
    title: 'Track Your Progress',
    description: 'Monitor your workouts, nutrition, and sleep effortlessly.',
  },
  {
    title: 'Achieve Your Goals',
    description: 'Get personalized insights to reach your fitness goals faster.',
  },
];

export default function OnboardingScreen() {
  const [step, setStep] = useState(0);
  const setHasCompletedOnboarding = useAppStore((state) => state.setHasCompletedOnboarding);

  const handleNext = () => {
    if (step < ONBOARDING_STEPS.length - 1) {
      setStep(step + 1);
    } else {
      finishOnboarding();
    }
  };

  const finishOnboarding = () => {
    setHasCompletedOnboarding(true);
    router.replace('/(auth)/login');
  };

  const currentStep = ONBOARDING_STEPS[step];

  return (
    <ScreenContainer edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.container}>
        <View style={styles.skipContainer}>
          <Button title="Skip" variant="ghost" onPress={finishOnboarding} />
        </View>

        <View style={styles.content}>
          <View style={styles.placeholderImage}>
            {/* TODO: Add SVG illustration here */}
          </View>
          <Text variant="displaySmall" align="center" style={styles.title}>
            {currentStep?.title}
          </Text>
          <Text variant="bodyLarge" color="textSecondary" align="center" style={styles.description}>
            {currentStep?.description}
          </Text>
        </View>

        <View style={styles.footer}>
          <View style={styles.pagination}>
            {ONBOARDING_STEPS.map((_, index) => (
              <View
                key={index}
                style={[
                  styles.dot,
                  index === step && styles.activeDot,
                ]}
              />
            ))}
          </View>
          <Button
            title={step === ONBOARDING_STEPS.length - 1 ? "Get Started" : "Next"}
            onPress={handleNext}
            style={styles.button}
          />
        </View>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: Spacing.xl,
  },
  skipContainer: {
    alignItems: 'flex-end',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderImage: {
    width: width * 0.7,
    height: width * 0.7,
    borderRadius: width * 0.35,
    backgroundColor: '#E0E1E6',
    marginBottom: Spacing.xxxl,
  },
  title: {
    marginBottom: Spacing.md,
  },
  description: {
    paddingHorizontal: Spacing.xl,
  },
  footer: {
    marginTop: 'auto',
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E0E1E6',
  },
  activeDot: {
    backgroundColor: '#208AEF', // primary
    width: 24,
  },
  button: {
    width: '100%',
  },
});
