/**
 * Shared motion thresholds and physics configs for FitOnus navigation,
 * edge swipe-back gestures, and bottom sheet drag-to-dismiss.
 *
 * All predicate functions are marked 'worklet' so they execute synchronously
 * on the UI thread without crossing the React Native bridge.
 */

export const TAB_SPRING = { damping: 18, stiffness: 320, mass: 0.6 } as const;
export const ICON_PULSE_SPRING = { damping: 14, stiffness: 280, mass: 0.5 } as const;
export const SHEET_SPRING = { damping: 26, stiffness: 320, mass: 0.8 } as const;
export const SNAP_SPRING = { damping: 28, stiffness: 420, mass: 0.5 } as const;
export const TRAIL_SPRING = { damping: 22, stiffness: 320, mass: 0.6 } as const;

/**
 * Calculates continuous tab drag position from horizontal touch coordinate.
 * Tab coordinates are centered within each slot cell across the bar width.
 */
export function getTabDragPosition(x: number, width: number, slots: number): number {
  'worklet';
  if (width <= 0 || slots <= 1) return 0;
  return Math.max(0, Math.min(slots - 1, x / (width / slots) - 0.5));
}

/**
 * Finds the nearest tab slot index from continuous position.
 */
export function nearestTabSlot(position: number, lastSlot: number): number {
  'worklet';
  return Math.max(0, Math.min(lastSlot, Math.round(position)));
}

/**
 * Evaluates whether an edge swipe-back gesture has met the completion threshold.
 * Requires either crossing ~28% of the screen width or a deliberate flick (> 700 px/s).
 */
export function shouldCompleteSwipeBack(
  translationX: number,
  velocityX: number,
  screenWidth: number
): boolean {
  'worklet';
  if (translationX <= 0) return false;
  return translationX > screenWidth * 0.28 || (translationX >= 40 && velocityX > 700);
}

/**
 * Evaluates whether a sheet pull-down drag has met the dismiss threshold.
 * Requires dragging down > 22% of sheet height or a deliberate downward flick (> 800 px/s).
 */
export function shouldDismissSheet(
  distance: number,
  velocityY: number,
  sheetHeight: number
): boolean {
  'worklet';
  if (distance <= 0) return false;
  return distance > sheetHeight * 0.22 || (distance >= 35 && velocityY > 800);
}

/**
 * Computes remaining exit animation duration scaled by velocity, clamped for smoothness.
 */
export function screenExitDuration(
  remaining: number,
  velocity: number,
  maxDuration = 240
): number {
  'worklet';
  const effectiveVelocity = Math.max(Math.abs(velocity), 1500);
  const calculated = (Math.max(0, remaining) / effectiveVelocity) * 1000;
  return Math.min(Math.max(calculated, 80), maxDuration);
}
