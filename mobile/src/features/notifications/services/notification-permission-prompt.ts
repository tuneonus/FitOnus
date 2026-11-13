import type { KeyValueStore, NotificationPermissionState } from '../types/push';

/**
 * One-time "allow notifications?" offer shown after sign-in, on the first screen the user can actually use.
 *
 * Android 13+ shows the system dialog at most twice per install, and a denial is final for the app's own UI,
 * so the app asks once, with context, and then leaves the decision alone: `Not now` and a system denial both
 * end up in Settings → Notifications (see `notification-permission-card.ts`), never in a second automatic prompt.
 *
 * This module is pure (no native imports) so the policy is unit-tested in node.
 */
export const PERMISSION_PROMPT_KEY = 'fitonus.push.permission-prompt.v1';

/** Wait this long after the first usable screen appears so the offer never lands on top of a transition. */
export const PERMISSION_PROMPT_SETTLE_MS = 1200;

export interface PermissionPromptCopy {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
}

export const PERMISSION_PROMPT_COPY: PermissionPromptCopy = {
  title: 'Stay on track with OnusFit',
  message:
    'Allow notifications to get workout and hydration reminders and updates from your coach. You can change this any time in Settings.',
  confirmLabel: 'Allow notifications',
  cancelLabel: 'Not now',
};

export interface PermissionPromptInput {
  /** Live OS permission (null while unknown). */
  permission: NotificationPermissionState | null;
  /** The offer was already answered on this install. */
  alreadyAnswered: boolean;
  signedIn: boolean;
  /** Splash / auth / onboarding screens, or a blocking modal (maintenance, forced update). */
  blocked: boolean;
}

/**
 * True only for a first-ever, still-undetermined permission. Granted (including every Android < 13 device),
 * denied, permanently denied and unsupported platforms never qualify, which is what prevents prompt loops.
 */
export function shouldOfferPermissionPrompt(input: PermissionPromptInput): boolean {
  if (!input.signedIn || input.blocked || input.alreadyAnswered) return false;
  const { permission } = input;
  if (!permission || permission.granted) return false;
  return permission.status === 'undetermined' && permission.canAskAgain;
}

/** Fails closed: a storage error counts as "already answered" so a broken store can never cause a prompt loop. */
export async function hasAnsweredPermissionPrompt(store: KeyValueStore): Promise<boolean> {
  try {
    return (await store.get(PERMISSION_PROMPT_KEY)) !== null;
  } catch {
    return true;
  }
}

export async function markPermissionPromptAnswered(
  store: KeyValueStore,
  outcome: 'accepted' | 'dismissed',
  now: () => number = Date.now,
): Promise<void> {
  try {
    await store.set(PERMISSION_PROMPT_KEY, JSON.stringify({ outcome, at: now() }));
  } catch {
    // The in-memory guard in the component still prevents a repeat during this session.
  }
}
