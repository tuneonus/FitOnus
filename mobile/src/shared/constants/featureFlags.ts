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
