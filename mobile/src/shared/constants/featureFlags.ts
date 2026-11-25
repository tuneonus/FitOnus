/**
 * Centralized feature flags for FitOnus mobile.
 *
 * WEARABLES_ENABLED — set to `false` to hide all smartwatch / wearable UI,
 * block navigation to wearable screens, and prevent background sync.
 * Set to `true` when the native HealthKit / Health Connect bridge is ready.
 *
 * All wearable implementation code is intentionally preserved; only UI
 * visibility, navigation, and sync triggers are gated by this flag.
 */

/** Master toggle for smartwatch / wearable integration features. */
export const WEARABLES_ENABLED = false;

/**
 * Master toggle for SSE streaming AI Coach replies. Disabled by default so existing
 * non-streaming `POST /api/v1/coach/chat` remains the default path until rolled out.
 */
export const AI_COACH_STREAMING_ENABLED =
  typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_AI_COACH_STREAMING_ENABLED === 'true';

let streamingOverride: boolean | null = null;

export function isAiCoachStreamingEnabled(): boolean {
  return streamingOverride ?? AI_COACH_STREAMING_ENABLED;
}

export function setAiCoachStreamingEnabledForTests(enabled: boolean | null): void {
  streamingOverride = enabled;
}
