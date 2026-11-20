import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const read = (relative: string) => readFileSync(path.join(__dirname, '..', 'src', relative), 'utf8');

describe('workout animations are wired into the live screens', () => {
  it('the active workout screen uses the animated session clock, pause button and strip', () => {
    const screen = read('features/workouts/screens/ActiveWorkoutScreen.tsx');
    assert.match(screen, /ElapsedTimer/);
    assert.match(screen, /PauseButton/);
    assert.match(screen, /useAnimatedColor/);
  });

  it('a set row fades to its done state and follows the member’s reduce-motion setting', () => {
    const row = read('features/workouts/components/SetRow.tsx');
    assert.match(row, /useTween\(set\.done/);
    assert.match(row, /useReduceMotion/);
  });

  it('the rest card enters and exits, and its bar drains evenly from full', () => {
    const rest = read('features/workouts/components/RestTimer.tsx');
    assert.match(rest, /<Reveal exit/);
    assert.match(rest, /animateOnMount=\{false\}/);
    assert.match(rest, /\blinear\b/);
  });

  it('the completion screen counts its stats up and staggers its sections', () => {
    const screen = read('features/workouts/screens/WorkoutCompleteScreen.tsx');
    assert.match(screen, /AnimatedNumber/);
    assert.match(screen, /<Reveal index=\{5\}/);
  });
});

describe('chart, skeleton and empty-state animations', () => {
  it('every chart animates through the shared tween so reduced motion shows the finished chart', () => {
    assert.match(read('shared/components/charts/ProgressRing.tsx'), /useTween\(progress/);
    assert.match(read('shared/components/charts/BarChart.tsx'), /useTween\(1/);
    assert.match(read('shared/components/charts/use-line-draw.ts'), /useTween\(1/);
    assert.match(read('shared/components/charts/LineChart.tsx'), /useLineDraw/);
    assert.match(read('shared/components/charts/Sparkline.tsx'), /useLineDraw/);
  });

  it('the skeleton follows the live reduce-motion setting, not the value read at startup', () => {
    const skeleton = read('shared/components/ui/Skeleton.tsx');
    assert.match(skeleton, /useReduceMotion/);
    assert.doesNotMatch(skeleton, /useReducedMotion/);
  });

  it('the empty state rises in through the shared Reveal', () => {
    assert.match(read('shared/components/ui/EmptyState.tsx'), /<Reveal/);
  });

  it('no animation file uses StyleSheet.absoluteFillObject, which React Native 0.88 removed', () => {
    for (const file of [
      'features/workouts/components/SessionClock.tsx',
      'features/workouts/components/SetRow.tsx',
      'shared/components/ui/Toggle.tsx',
    ]) {
      assert.doesNotMatch(read(file), /absoluteFillObject/, file);
    }
  });
});
