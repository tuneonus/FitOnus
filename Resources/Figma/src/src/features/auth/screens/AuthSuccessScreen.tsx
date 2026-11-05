import React from 'react';
import { motion } from 'framer-motion';
import { CheckIcon } from 'lucide-react';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Button } from '../../../shared/components/ui/Button';

export function AuthSuccessScreen() {
  const { reset } = useNavigation();
  return (
    <div className="flex h-full flex-col items-center justify-center bg-bg px-8 text-center">
      <motion.span
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
        className="flex h-20 w-20 items-center justify-center rounded-full bg-accent text-accentInk">
        
        <CheckIcon size={36} strokeWidth={2.5} aria-hidden="true" />
      </motion.span>
      <h1 className="mt-6 text-[26px] font-semibold tracking-[-0.02em] text-ink">Password updated</h1>
      <p className="mt-2 text-[15px] leading-relaxed text-muted">
        You’ve been signed out of other devices for safety. Log in with your new password.
      </p>
      <Button size="lg" fullWidth className="mt-8" onClick={() => reset('login')}>
        Log in
      </Button>
    </div>);

}