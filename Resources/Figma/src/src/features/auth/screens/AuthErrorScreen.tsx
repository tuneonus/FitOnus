import React from 'react';
import { motion } from 'framer-motion';
import { LockIcon, TimerOffIcon, WifiOffIcon } from 'lucide-react';
import { useNavigation, useRouteParams } from '../../../app/navigation/NavigationContext';
import { Button } from '../../../shared/components/ui/Button';

const reasons = {
  locked: {
    icon: LockIcon,
    title: 'Account temporarily locked',
    body: 'Too many incorrect password attempts. For your security, sign-in is paused for 15 minutes. Resetting your password unlocks it right away.',
    primary: 'Reset password',
    route: 'forgotPassword' as const
  },
  network: {
    icon: WifiOffIcon,
    title: 'Couldn’t reach FitOnus',
    body: 'Check your internet connection and try again. Your data is safe.',
    primary: 'Try again',
    route: 'login' as const
  },
  expired: {
    icon: TimerOffIcon,
    title: 'This link has expired',
    body: 'Password reset links work for 30 minutes. Request a new one and use it soon after it arrives.',
    primary: 'Send a new link',
    route: 'forgotPassword' as const
  }
};

export function AuthErrorScreen() {
  const { reason = 'locked' } = useRouteParams();
  const { reset, replace } = useNavigation();
  const r = reasons[reason as keyof typeof reasons] ?? reasons.locked;
  const Icon = r.icon;

  return (
    <div className="flex h-full flex-col items-center justify-center bg-bg px-8 text-center">
      <motion.span
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
        className="flex h-20 w-20 items-center justify-center rounded-full bg-bad/10 text-bad">
        
        <Icon size={34} aria-hidden="true" />
      </motion.span>
      <h1 className="mt-6 text-[26px] font-semibold tracking-[-0.02em] text-ink">{r.title}</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">{r.body}</p>
      <Button size="lg" fullWidth className="mt-8" onClick={() => replace(r.route)}>{r.primary}</Button>
      <Button size="lg" variant="ghost" fullWidth className="mt-2" onClick={() => reset('welcome')}>Back to start</Button>
    </div>);

}