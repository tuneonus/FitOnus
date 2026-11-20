import { useSyncExternalStore } from 'react';
import { AccessibilityInfo } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

/**
 * Whether the member asked the system to reduce motion, kept live.
 *
 * Reanimated's own `useReducedMotion()` reads the setting once when the app starts, so turning the setting on (or off)
 * while the app is open would be ignored until a restart. This hook starts from that startup value, so the first
 * render is already right, then follows `AccessibilityInfo`. One shared subscription serves every component using
 * it, which matters because buttons, charts and rows all ask.
 */
let current: boolean | null = null;
const listeners = new Set<() => void>();
let removeSystemListener: (() => void) | null = null;
let generation = 0;

function publish(next: boolean) {
  if (current === next) return;
  current = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (listeners.size === 1) {
    generation += 1;
    const mine = generation;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((enabled) => {
        // Ignore an answer that arrives after everyone has unsubscribed (or after a newer subscription started).
        if (mine === generation) publish(enabled);
      })
      .catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', publish);
    removeSystemListener = () => subscription.remove();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      generation += 1;
      removeSystemListener?.();
      removeSystemListener = null;
    }
  };
}

const getSnapshot = () => current;
const getServerSnapshot = () => null;

export function useReduceMotion(): boolean {
  const atStartup = useReducedMotion();
  const live = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return live ?? atStartup;
}
