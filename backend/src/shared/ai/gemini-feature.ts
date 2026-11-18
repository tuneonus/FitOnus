/**
 * The Gemini-backed capabilities. Used to pick a per-feature model and to label telemetry rows.
 *
 * Lives in shared/ai (not in a feature module) because both the provider client (`gemini-client.ts`)
 * and the app-settings runtime service need it, and shared code must not import feature modules.
 * `app-settings/domain/gemini-config.ts` re-exports it so existing imports keep working.
 */
export type GeminiFeature =
  | 'coach_chat'
  | 'coach_insights'
  | 'meal_photo'
  | 'voice_meal'
  | 'workout_generator';
