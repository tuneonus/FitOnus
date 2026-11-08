import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Keyboard,
  StatusBar,
  Animated,
  AccessibilityInfo,
  BackHandler,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ChevronLeft,
  ArrowRight,
  Sparkles,
  UserRound,
  CalendarDays,
  Ruler,
  Scale,
  Dumbbell,
  Target,
  MapPin,
  Clock3,
  Utensils,
  HeartPulse,
  Watch,
  ClipboardCheck,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react-native';
import { useNavigation } from '@/app/navigation/NavigationContext';
import { Button } from '@/shared/components/ui/Button';
import { Logo } from '@/shared/components/common/Logo';
import { useProfileSetupStore, type ProfileSetup } from '../store/profileSetupStore';
import { onboardingSteps, onboardingSections, type OnboardingStepId } from '../constants/steps';
import { useAuthStore } from '@/features/auth/stores/auth-store';
import {
  useSaveOnboardingStep,
  useCompleteOnboarding,
  useProfile,
} from '@/features/profile/hooks/use-profile';
import { useUpdateSettings } from '@/features/profile/hooks/use-settings';
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
import { canContinueOnboarding, getStepPayload } from '../utils/onboarding';
import { useTheme } from '@/hooks/use-theme';

const stepIcons: Record<OnboardingStepId, LucideIcon> = {
  intro: Sparkles,
  personal: UserRound,
  dob: CalendarDays,
  height: Ruler,
  weight: Scale,
  experience: Dumbbell,
  goal: Target,
  workoutPreference: MapPin,
  equipment: Dumbbell,
  duration: Clock3,
  food: Utensils,
  health: HeartPulse,
  device: Watch,
  confirm: ClipboardCheck,
  done: Sparkles,
};

export function OnboardingScreen() {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { reset } = useNavigation();
  const [index, setIndex] = useState(0);
  const [returnToReview, setReturnToReview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [reduceMotion, setReduceMotion] = useState(true);
  const [entrance] = useState(() => new Animated.Value(1));
  const resumed = useRef(false);
  const interacted = useRef(false);
  const submitting = useRef(false);
  const reviewSnapshot = useRef<ProfileSetup | null>(null);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setup = useProfileSetupStore();
  const { mutateAsync: saveStep } = useSaveOnboardingStep();
  const { mutateAsync: completeOnboarding } = useCompleteOnboarding();
  const { mutateAsync: updateSettings } = useUpdateSettings();
  const { data: serverProfile, isLoading: loadingProfile } = useProfile();
  const step = (onboardingSteps[index] ?? onboardingSteps[0])!;
  const last = index === onboardingSteps.length - 1;
  const sectionIndex = onboardingSections.findIndex((section) =>
    (section.steps as readonly string[]).includes(step.id),
  );
  const section = onboardingSections[sectionIndex]!;
  const Icon = stepIcons[step.id];
  const canContinue = canContinueOnboarding(step.id, setup);

  useEffect(() => {
    if (!serverProfile || resumed.current) return;
    resumed.current = true;
    if (interacted.current) return;
    const resumeIndex = onboardingSteps.findIndex(
      (item) => item.id === serverProfile.currentOnboardingStep,
    );
    if (resumeIndex > 0 && serverProfile.currentOnboardingStep !== 'done') setIndex(resumeIndex);
  }, [serverProfile]);

  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      entrance.setValue(1);
      return;
    }
    entrance.setValue(0);
    const animation = Animated.timing(entrance, {
      toValue: 1,
      duration: 200,
      useNativeDriver: Platform.OS !== 'web',
    });
    animation.start();
    return () => animation.stop();
  }, [step.id, entrance, reduceMotion]);

  const handleBack = () => {
    if (saving || index === 0) return;
    Keyboard.dismiss();
    interacted.current = true;
    setError('');
    if (returnToReview) {
      if (reviewSnapshot.current) setup.update(reviewSnapshot.current);
      reviewSnapshot.current = null;
      setReturnToReview(false);
      setIndex(onboardingSteps.findIndex((item) => item.id === 'confirm'));
    } else setIndex((current) => Math.max(0, current - 1));
  };

  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (index === 0) return false;
      handleBack();
      return true;
    });
    return () => subscription.remove();
  });

  const handleNext = async (skip = false) => {
    if (submitting.current || (!skip && !canContinue)) return;
    submitting.current = true;
    interacted.current = true;
    Keyboard.dismiss();
    setSaving(true);
    setError('');
    const snapshot = useProfileSetupStore.getState();
    const payload = getStepPayload(step.id, snapshot);
    if (skip && step.id === 'health') payload.healthAllowed = false;
    if (skip && step.id === 'device') payload.deviceConnected = false;
    try {
      if (isAuthenticated) {
        if (last) {
          await completeOnboarding();
          useAuthStore.getState().updateUser({ onboardingCompleted: true });
        } else {
          await saveStep({ step: step.id, data: payload });
          if (step.id === 'health')
            await updateSettings({ healthConnectEnabled: skip ? false : snapshot.healthAllowed });
          if (step.id === 'device')
            await updateSettings({ smartwatchConnected: skip ? false : snapshot.deviceConnected });
        }
      }
      if (skip && step.id === 'health') setup.update({ healthAllowed: false });
      if (skip && step.id === 'device') setup.update({ deviceConnected: false });
      if (last) reset('home');
      else if (returnToReview) {
        reviewSnapshot.current = null;
        setReturnToReview(false);
        setIndex(onboardingSteps.findIndex((item) => item.id === 'confirm'));
      } else setIndex((current) => Math.min(current + 1, onboardingSteps.length - 1));
    } catch {
      setError(
        last
          ? 'Your plan couldn’t be finished. Check your connection and try again.'
          : 'Your answers couldn’t be saved. Check your connection and try again.',
      );
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  const goToStep = (id: string) => {
    const target = onboardingSteps.findIndex((item) => item.id === id);
    if (target < 0 || saving) return;
    interacted.current = true;
    setError('');
    reviewSnapshot.current = { ...useProfileSetupStore.getState() };
    setReturnToReview(true);
    setIndex(target);
  };

  const renderStep = () => {
    switch (step.id) {
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
    }
  };

  const buttonTitle = returnToReview
    ? 'Save & return to plan'
    : last
      ? 'Meet my coach'
      : step.id === 'intro'
        ? 'Let’s make it yours'
        : step.id === 'confirm'
          ? 'This feels right'
          : step.id === 'device'
            ? 'Review my plan'
            : 'Continue';
  const nextStep = onboardingSteps[index + 1];

  return (
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: colors.bg }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) }]}>
        <View style={styles.topBar}>
          <View style={styles.headerSide}>
            {index > 0 && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel={returnToReview ? 'Return to plan' : 'Previous step'}
                disabled={saving}
                onPress={handleBack}
                style={[styles.backButton, { backgroundColor: colors.surface }]}
              >
                <ChevronLeft size={22} color={colors.ink} />
              </TouchableOpacity>
            )}
          </View>
          <Logo size={30} withWordmark />
          <View style={[styles.headerSide, styles.headerRight]}>
            {step.skippable && (
              <TouchableOpacity
                accessibilityRole="button"
                disabled={saving}
                onPress={() => void handleNext(true)}
                style={styles.skipButton}
              >
                <Text style={[styles.skipText, { color: colors.muted }]}>Later</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
        <View style={styles.progressArea}>
          <View style={styles.progressMeta}>
            <Text style={[styles.sectionLabel, { color: colors.ink }]}>
              {returnToReview ? 'Fine-tune your plan' : section.label}
            </Text>
            <Text
              style={[styles.stepCount, { color: colors.muted }]}
              accessibilityLabel={`Step ${index + 1} of ${onboardingSteps.length}`}
            >
              {String(index + 1).padStart(2, '0')}{' '}
              <Text style={{ color: colors.textTertiary }}>/ {onboardingSteps.length}</Text>
            </Text>
          </View>
          <View
            accessibilityRole="progressbar"
            accessibilityValue={{ min: 1, max: onboardingSteps.length, now: index + 1 }}
            accessibilityLabel="Setup progress"
            style={styles.progressTrack}
          >
            {onboardingSections.map((item, position) => {
              const fraction =
                position < sectionIndex
                  ? 1
                  : position > sectionIndex
                    ? 0
                    : ((item.steps as readonly string[]).indexOf(step.id) + 1) / item.steps.length;
              return (
                <View
                  key={item.label}
                  style={[styles.progressSegment, { backgroundColor: colors.line }]}
                >
                  <View
                    style={{
                      backgroundColor: colors.accentStrong,
                      height: '100%',
                      width: `${fraction * 100}%`,
                      borderRadius: 4,
                    }}
                  />
                </View>
              );
            })}
          </View>
        </View>
      </View>
      <ScrollView
        key={step.id}
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Animated.View
          pointerEvents={saving ? 'none' : 'auto'}
          style={[
            styles.content,
            {
              opacity: entrance,
              transform: [
                { translateY: entrance.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
              ],
            },
          ]}
        >
          {step.id !== 'intro' && step.id !== 'done' && (
            <View style={[styles.stepIcon, { backgroundColor: colors.primaryLight }]}>
              <Icon size={24} color={colors.accentStrong} strokeWidth={1.8} />
            </View>
          )}
          {step.skippable && (
            <Text style={[styles.optionalLabel, { color: colors.accentStrong }]}>
              A LITTLE EXTRA · OPTIONAL
            </Text>
          )}
          <Text accessibilityRole="header" style={[styles.title, { color: colors.ink }]}>
            {step.title}
          </Text>
          {step.subtitle && (
            <Text style={[styles.subtitle, { color: colors.muted }]}>{step.subtitle}</Text>
          )}
          <View style={styles.stepBody}>{renderStep()}</View>
        </Animated.View>
      </ScrollView>
      <View
        style={[
          styles.footer,
          {
            backgroundColor: colors.bg,
            borderColor: colors.line,
            paddingBottom: Math.max(insets.bottom, 16),
          },
        ]}
      >
        <View style={styles.footerContent}>
          {error ? (
            <Text accessibilityRole="alert" style={[styles.error, { color: colors.bad }]}>
              {error}
            </Text>
          ) : (
            <View style={styles.footerHint}>
              <ShieldCheck size={14} color={colors.muted} />
              <Text style={[styles.hint, { color: colors.muted }]}>{step.hint}</Text>
            </View>
          )}
          <Button
            title={buttonTitle}
            size="lg"
            fullWidth
            iconRight={ArrowRight}
            loading={saving}
            disabled={!canContinue || (isAuthenticated && loadingProfile)}
            onPress={() => void handleNext()}
          />
          {nextStep && !returnToReview && (
            <Text style={[styles.upNext, { color: colors.muted }]}>
              Up next: {nextStep.title.replace(/[?.]$/, '')}
            </Text>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { width: '100%', maxWidth: 528, alignSelf: 'center', paddingHorizontal: 24 },
  topBar: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  headerSide: { width: 52 },
  headerRight: { alignItems: 'flex-end' },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipButton: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  skipText: { fontSize: 13, fontWeight: '600' },
  progressArea: { paddingTop: 20, paddingBottom: 12 },
  progressMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  sectionLabel: { fontSize: 12, fontWeight: '600' },
  stepCount: { fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'] },
  progressTrack: { flexDirection: 'row', gap: 6 },
  progressSegment: { flex: 1, height: 4, borderRadius: 4, overflow: 'hidden' },
  scroll: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 18, paddingBottom: 28 },
  content: { width: '100%', maxWidth: 480, alignSelf: 'center' },
  stepIcon: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  optionalLabel: { fontSize: 10, letterSpacing: 1.3, fontWeight: '700', marginBottom: 12 },
  title: { fontSize: 31, lineHeight: 37, fontWeight: '700', letterSpacing: -1.1 },
  subtitle: { fontSize: 14, lineHeight: 22, marginTop: 10 },
  stepBody: { marginTop: 26 },
  footer: { borderTopWidth: 1, paddingHorizontal: 24, paddingTop: 14 },
  footerContent: { width: '100%', maxWidth: 480, alignSelf: 'center', gap: 12 },
  footerHint: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7 },
  hint: { fontSize: 11, lineHeight: 16, textAlign: 'center', flexShrink: 1 },
  upNext: { fontSize: 10.5, lineHeight: 16, textAlign: 'center' },
  error: { fontSize: 12, lineHeight: 18, textAlign: 'center' },
});
