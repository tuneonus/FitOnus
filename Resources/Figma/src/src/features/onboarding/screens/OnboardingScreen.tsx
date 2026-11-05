import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeftIcon, SparklesIcon } from 'lucide-react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Button } from '../../../shared/components/ui/Button';
import { useHealthStore } from '../../health-integration/store/healthStore';
import { useProfileSetupStore } from '../store/profileSetupStore';
import { onboardingSteps, OnboardingStepId } from '../constants/steps';
import {
  StepDevice,
  StepDob,
  StepDuration,
  StepEquipment,
  StepExperience,
  StepFood,
  StepGoal,
  StepHealthPermissions,
  StepHeight,
  StepIntro,
  StepPersonal,
  StepWeight,
  StepWorkoutPreference } from
'../components/OnboardingSteps';
import { StepGoalConfirmation } from '../components/StepGoalConfirmation';

export function OnboardingScreen() {
  const { reset } = useNavigation();
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState(1);
  const name = useProfileSetupStore((s) => s.name);
  const deviceConnected = useProfileSetupStore((s) => s.deviceConnected);
  const healthAllowed = useProfileSetupStore((s) => s.healthAllowed);
  const setHealthStatus = useHealthStore((s) => s.setStatus);
  const step = onboardingSteps[index];
  const total = onboardingSteps.length - 1;

  const go = (next: number) => {
    setDir(next > index ? 1 : -1);
    setIndex(next);
  };
  const goTo = (id: string) => go(onboardingSteps.findIndex((s) => s.id === id));

  const finish = () => {
    setHealthStatus(healthAllowed || deviceConnected ? 'synced' : 'noDevice');
    reset('home');
  };

  const canContinue = step.id !== 'personal' || name.trim().length > 0;

  const render = (id: OnboardingStepId) => {
    switch (id) {
      case 'intro':return <StepIntro />;
      case 'personal':return <StepPersonal />;
      case 'dob':return <StepDob />;
      case 'height':return <StepHeight />;
      case 'weight':return <StepWeight />;
      case 'experience':return <StepExperience />;
      case 'goal':return <StepGoal />;
      case 'workoutPreference':return <StepWorkoutPreference />;
      case 'equipment':return <StepEquipment />;
      case 'duration':return <StepDuration />;
      case 'food':return <StepFood />;
      case 'health':return <StepHealthPermissions />;
      case 'device':return <StepDevice />;
      case 'confirm':return <StepGoalConfirmation onEdit={goTo} />;
      default:return null;
    }
  };

  if (step.id === 'done') {
    return (
      <div className="flex h-full flex-col bg-hero px-6 pb-10 pt-24 text-heroInk">
        <motion.span initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.25 }} className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent text-accentInk">
          <SparklesIcon size={30} aria-hidden="true" />
        </motion.span>
        <h1 className="mt-6 text-[32px] font-semibold leading-tight tracking-[-0.03em]">You’re all set, {name.split(' ')[0]}.</h1>
        <p className="mt-3 text-[15px] leading-relaxed text-heroMuted">
          Your coach has your goals, preferences and {healthAllowed || deviceConnected ? 'health data' : 'training plan'}. First recommendation is ready on Home.
        </p>
        <ul className="mt-8 space-y-3 text-[14px]">
          {['Week 1 plan generated', 'Calorie and protein targets set', healthAllowed || deviceConnected ? 'Health sync started' : 'Connect a device anytime in Settings'].map((t) =>
          <li key={t} className="flex items-center gap-2.5">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden="true" />
              {t}
            </li>
          )}
        </ul>
        <Button size="lg" fullWidth className="mt-auto" onClick={finish}>
          Go to my dashboard
        </Button>
      </div>);

  }

  return (
    <div className="flex h-full flex-col bg-bg">
      <header className="shrink-0 px-2 pt-12">
        <div className="flex h-12 items-center gap-2">
          <button
            type="button"
            onClick={() => index === 0 ? reset('welcome') : go(index - 1)}
            aria-label="Previous step"
            className="flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-ink/[0.06]">
            
            <ChevronLeftIcon size={24} aria-hidden="true" />
          </button>
          <div className="flex-1 px-1">
            <div
              className="h-1.5 overflow-hidden rounded-full bg-ink/[0.08]"
              role="progressbar"
              aria-label="Onboarding progress"
              aria-valuenow={index + 1}
              aria-valuemin={1}
              aria-valuemax={total}>
              
              <motion.div className="h-full rounded-full bg-ink" animate={{ width: `${(index + 1) / total * 100}%` }} transition={{ duration: 0.25 }} />
            </div>
          </div>
          {step.skippable ?
          <button type="button" onClick={() => go(index + 1)} className="h-11 px-3 text-[14px] font-semibold text-muted hover:text-ink">
              Skip
            </button> :

          <span className="w-11" />
          }
        </div>
      </header>
      <div className="no-scrollbar relative flex-1 overflow-y-auto">
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div
            key={step.id}
            initial={{ opacity: 0, x: dir * 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -24 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
            className="px-6 pb-8 pt-4">
            
            <p className="font-mono text-[12px] text-muted">{index + 1} / {total}</p>
            <h1 className="mt-1 text-[28px] font-semibold leading-tight tracking-[-0.02em] text-ink">{step.title}</h1>
            {step.subtitle && <p className="mt-1.5 text-[15px] text-muted">{step.subtitle}</p>}
            <div className="mt-6">{render(step.id)}</div>
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="shrink-0 border-t border-line bg-bg px-6 pb-8 pt-3">
        <Button size="lg" fullWidth disabled={!canContinue} onClick={() => go(index + 1)}>
          {step.id === 'intro' ? 'Get started' : step.id === 'confirm' ? 'Looks good' : 'Continue'}
        </Button>
      </div>
    </div>);

}