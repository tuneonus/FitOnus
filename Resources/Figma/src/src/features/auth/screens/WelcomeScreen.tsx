import React from 'react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Logo } from '../../../shared/components/common/Logo';
import { Button } from '../../../shared/components/ui/Button';
import { images } from '../../../shared/constants/images';

export function WelcomeScreen() {
  const { navigate } = useNavigation();

  return (
    <div className="flex h-full flex-col bg-hero text-heroInk">
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <img src={images.welcomeHero} alt="Athlete pushing a weighted sled in a dark gym" className="h-full w-full object-cover object-top" />
        <div className="absolute left-6 top-16">
          <Logo size={36} withWordmark tone="hero" />
        </div>
      </div>
      <div className="px-6 pb-10 pt-6">
        <h1 className="text-[32px] font-semibold leading-[1.1] tracking-[-0.03em]">
          A coach that reads your body, not just your steps.
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-heroMuted">
          FitOnus turns sleep, recovery, training and meals into one clear plan — and answers your questions in plain language.
        </p>
        <div className="mt-6 space-y-2.5">
          <Button size="lg" fullWidth onClick={() => navigate('signup')}>
            Create account
          </Button>
          <button
            type="button"
            onClick={() => navigate('login')}
            className="h-[52px] w-full rounded-full border border-heroInk/20 text-[16px] font-semibold text-heroInk transition-colors duration-150 hover:bg-heroInk/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent">
            
            I already have an account
          </button>
        </div>
        <p className="mt-4 text-center text-[12px] leading-relaxed text-heroMuted">
          By continuing you agree to our{' '}
          <a href="#terms" className="font-medium text-heroInk underline underline-offset-2">Terms</a> and{' '}
          <a href="#privacy" className="font-medium text-heroInk underline underline-offset-2">Privacy Policy</a>.
        </p>
      </div>
    </div>);

}