import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigation } from './navigation/NavigationContext';
import { RouteScreen, heroStatusRoutes } from './routes/screenRegistry';
import { PhoneFrame } from '../shared/components/common/PhoneFrame';
import { motionTokens } from '../shared/theme/tokens';

export function AppShell() {
  const { route, direction, isTabRoot } = useNavigation();
  return (
    <PhoneFrame showNav={isTabRoot} heroStatusBar={heroStatusRoutes.includes(route.name)}>
      <AnimatePresence initial={false} mode="popLayout" custom={direction}>
        <motion.div
          key={route.key}
          className="absolute inset-0"
          initial={direction === 0 ? { opacity: 0 } : { opacity: 0, x: direction * 28 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: motionTokens.base, ease: motionTokens.ease }}>
          
          <RouteScreen name={route.name} />
        </motion.div>
      </AnimatePresence>
    </PhoneFrame>);

}