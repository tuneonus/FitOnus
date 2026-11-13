import { AsyncLocalStorage } from 'node:async_hooks';

/** Metered AI capabilities. Each maps to one admin feature flag and one daily limit. */
export const AI_USAGE_ACTIONS = ['coach_chat', 'meal_photo', 'voice_meal', 'workout_generator'] as const;
export type AiUsageAction = (typeof AI_USAGE_ACTIONS)[number];

export interface AiUsageRequest {
  /** The authenticated caller. Quota, telemetry and refunds are all attributed to this user. */
  userId: string;
  action: AiUsageAction;
}

/**
 * Single choke point between a use case and the AI provider.
 *
 * Every code path that can reach Gemini MUST run inside `run`; use cases receive the gate by
 * constructor injection so it cannot be forgotten silently.
 *
 * Billing policy:
 * - Requests rejected before `run` (validation, auth, payload limits) are never charged.
 * - A disabled feature or an exhausted quota rejects the request without charging and without
 *   calling the provider.
 * - An admitted request is charged one unit atomically BEFORE the provider is called.
 * - If `work` throws before the provider request was dispatched (for example the API key is not
 *   configured, or a database read failed), the unit is refunded.
 * - If the provider request was dispatched, the unit is consumed even when the provider fails or
 *   times out: the call may still be billed by the provider and refunding would let a caller
 *   retry failing requests indefinitely.
 *
 * Application quotas bound usage per user per day. They are not a substitute for a hard spending
 * cap configured with the AI provider.
 */
export interface AiUsageGate {
  /** Throws FEATURE_DISABLED when an administrator switched the feature off. Charges nothing. */
  assertEnabled(action: AiUsageAction): Promise<void>;
  /** Admits (feature flag + atomic quota), runs `work`, and attributes provider telemetry to the user. */
  run<T>(request: AiUsageRequest, work: () => Promise<T>): Promise<T>;
}

/** Mutable per-admitted-request state, visible to provider adapters through AsyncLocalStorage. */
export interface AiRequestContext {
  readonly userId: string;
  readonly action: AiUsageAction;
  /** Set once the provider request is actually sent; decides refund vs. consume on failure. */
  dispatched: boolean;
}

const storage = new AsyncLocalStorage<AiRequestContext>();

export const runWithAiRequestContext = <T>(context: AiRequestContext, work: () => Promise<T>): Promise<T> =>
  storage.run(context, work);

export const currentAiRequestContext = (): AiRequestContext | undefined => storage.getStore();

/** Provider adapters call this immediately before sending the request to the provider. */
export function markAiRequestDispatched(): void {
  const context = storage.getStore();
  if (context) context.dispatched = true;
}
