import React, { useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigation } from '../../../app/navigation/NavigationContext';
import { Logo } from '../../../shared/components/common/Logo';

export function SplashScreen() {
  const { reset } = useNavigation();

  useEffect(() => {
    const t = setTimeout(() => reset('welcome'), 1600);
    return () => clearTimeout(t);
  }, [reset]);

  return (
    <div className="flex h-full flex-col items-center justify-center bg-hero text-heroInk">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
        className="flex flex-col items-center">
        
        <Logo size={72} />
        <p className="mt-5 text-[28px] font-semibold tracking-[-0.03em]">FitOnus</p>
        <p className="mt-1 text-[14px] text-heroMuted">Your AI fitness & health coach</p>
      </motion.div>
      <div className="absolute bottom-14 flex items-center gap-1.5" aria-label="Loading">
        {[0, 1, 2].map((i) =>
        <motion.span
          key={i}
          className="h-1.5 w-1.5 rounded-full bg-accent"
          animate={{ opacity: [0.25, 1, 0.25] }}
          transition={{ duration: 1, repeat: Infinity, delay: i * 0.15 }} />

        )}
      </div>
      <p className="absolute bottom-6 text-[11px] text-heroMuted">by TuneOnus</p>
    </div>);

}