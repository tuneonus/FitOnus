import type {
  Audience,
  AudienceFilter,
  AudienceType,
  CampaignStatus,
  DeliveryCounts,
  DeliveryStatus,
  NotificationCampaign,
  NotificationCategory,
  NotificationContent,
  NotificationDestination,
} from './types';

/** Pure rules behind the notification screens, kept free of React so they can be tested directly. */

export const TITLE_MAX = 100;
export const BODY_MAX = 500;
export const MAX_AUDIENCE_USERS = 1000;
/** Matches the backend: more than this many hand-picked users counts as a bulk send. */
export const BULK_USER_THRESHOLD = 25;
// The image rules are shared with every other feature that lets an admin attach a picture (see features/media).
// Re-exported here so the notification screens and their tests keep one import path.
export {
  IMAGE_ACCEPT,
  IMAGE_ACCEPTED_TYPES,
  IMAGE_FORMATS_LABEL,
  IMAGE_MAX_BYTES,
  canPreviewInBrowser,
  describeImageUploadFailure,
  formatFileSize,
  resolveImageType,
  uploadImageFile as uploadComposerImage,
  validateImageFile,
  type ImageUploadOutcome,
} from '../media/image-upload';
export const MIN_SCHEDULE_LEAD_MS = 30_000;
export const MAX_SCHEDULE_HORIZON_MS = 90 * 24 * 60 * 60 * 1000;

export const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  announcements: 'Announcements',
  challenges: 'Challenges',
  coach_insights: 'Coach insights',
  goal_updates: 'Goal updates',
};

export const DESTINATION_LABELS: Record<NotificationDestination, string> = {
  home: 'Home',
  activity: 'Activity',
  coach: 'AI Coach',
  progress: 'Progress',
  profile: 'Profile',
  workouts: 'Workouts',
  nutrition: 'Nutrition',
  goals: 'Goals',
  challenges: 'Challenges',
  badges: 'Badges',
  weekly_report: 'Weekly report',
  notifications: 'Notification inbox',
};

export const GOAL_OPTIONS = [
  { value: 'lose', label: 'Lose weight' },
  { value: 'gain', label: 'Gain weight' },
  { value: 'maintain', label: 'Maintain' },
  { value: 'strength', label: 'Strength' },
  { value: '5k', label: '5K' },
  { value: '10k', label: '10K' },
  { value: 'marathon', label: 'Marathon' },
] as const;

export const EXPERIENCE_OPTIONS = [
  { value: 'beginner', label: 'Beginner' },
  { value: 'intermediate', label: 'Intermediate' },
  { value: 'advanced', label: 'Advanced' },
] as const;

export const STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: 'Draft',
  scheduled: 'Scheduled',
  sending: 'Sending',
  sent: 'Sent',
  partially_failed: 'Partially failed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

export type StatusVariant = 'active' | 'disabled' | 'completed' | 'pending' | 'neutral' | 'warning' | 'info';

export const STATUS_VARIANTS: Record<CampaignStatus, StatusVariant> = {
  draft: 'neutral',
  scheduled: 'info',
  sending: 'pending',
  sent: 'active',
  partially_failed: 'warning',
  failed: 'disabled',
  cancelled: 'neutral',
};

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  pending: 'Waiting to send',
  processing: 'Sending',
  accepted: 'Accepted by FCM',
  dry_run: 'Validated only (dry run)',
  received: 'Received on device',
  failed: 'Failed',
  invalid_token: 'Device token invalid',
};

export const DELIVERY_STATUS_VARIANTS: Record<DeliveryStatus, StatusVariant> = {
  pending: 'pending',
  processing: 'pending',
  accepted: 'info',
  dry_run: 'neutral',
  received: 'active',
  failed: 'disabled',
  invalid_token: 'warning',
};

/** Plain-language explanation of provider error codes, so an admin does not have to look them up. */
export const ERROR_CODE_HINTS: Record<string, string> = {
  UNREGISTERED: 'The app was uninstalled or its token expired. The device was deactivated.',
  INVALID_TOKEN: 'The stored token is malformed. The device was deactivated.',
  SENDER_ID_MISMATCH: 'The token belongs to a different Firebase project.',
  QUOTA_EXCEEDED: 'FCM rate limit reached. Retried automatically.',
  UNAVAILABLE: 'FCM was temporarily unavailable. Retried automatically.',
  INTERNAL: 'FCM had an internal error. Retried automatically.',
  FCM_AUTH_FAILED: 'The server could not authenticate to FCM. Check the service account on the backend.',
  FCM_PERMISSION_DENIED: 'The service account may not send for this project. Check its roles.',
  NETWORK_ERROR: 'The server could not reach FCM. Retried automatically.',
  TIMEOUT: 'FCM did not answer in time. Retried automatically.',
  DEVICE_INACTIVE: 'The device was removed or deactivated before this attempt.',
  ATTEMPTS_EXHAUSTED: 'The server stopped while sending and the retry budget was already used.',
  INVALID_ARGUMENT: 'FCM rejected the message content.',
};

export function describeErrorCode(code: string | null): string | null {
  if (!code) return null;
  return ERROR_CODE_HINTS[code] ?? 'See the server logs for details.';
}

export const canEdit = (status: CampaignStatus): boolean => status === 'draft';
export const canSend = (status: CampaignStatus): boolean => status === 'draft';
export const canCancel = (status: CampaignStatus): boolean => status === 'draft' || status === 'scheduled';
/** Statuses that still change on their own, so the screen keeps refreshing them. */
export const isInFlight = (status: CampaignStatus): boolean => status === 'scheduled' || status === 'sending';

export const isBulkAudience = (audience: Pick<Audience, 'type' | 'userIds'>): boolean =>
  audience.type !== 'users' || audience.userIds.length > BULK_USER_THRESHOLD;

export function audienceSummary(audience: Audience): string {
  if (audience.type === 'all') return 'All eligible users';
  if (audience.type === 'users') {
    const n = audience.userIds.length;
    return `${n} selected user${n === 1 ? '' : 's'}`;
  }
  const parts: string[] = [];
  const { primaryGoal, experienceLevel, onboardingCompleted } = audience.filter;
  if (primaryGoal?.length) parts.push(`goal: ${primaryGoal.join(', ')}`);
  if (experienceLevel?.length) parts.push(`level: ${experienceLevel.join(', ')}`);
  if (onboardingCompleted !== undefined) parts.push(onboardingCompleted ? 'onboarded' : 'not onboarded');
  return `Segment (${parts.join('; ') || 'no filters'})`;
}

/** An uploaded image attached to the composer. Only `key` is ever sent to the API; `url` is for showing it. */
export interface ComposerImage {
  key: string;
  /** Public URL, or null when the server could not derive one (media domain not configured). */
  url: string | null;
}

export interface ComposerState {
  title: string;
  body: string;
  category: NotificationCategory;
  destination: NotificationDestination | '';
  /** Optional. Null = a text-only notification. */
  image: ComposerImage | null;
  audienceType: AudienceType;
  userIds: string[];
  goals: string[];
  levels: string[];
  /** '' = any, otherwise the explicit choice. */
  onboarding: '' | 'completed' | 'pending';
}

export const emptyComposer = (): ComposerState => ({
  title: '',
  body: '',
  category: 'announcements',
  destination: '',
  image: null,
  audienceType: 'users',
  userIds: [],
  goals: [],
  levels: [],
  onboarding: '',
});

export function composerFromCampaign(campaign: NotificationCampaign): ComposerState {
  const { audience } = campaign;
  return {
    title: campaign.title,
    body: campaign.body,
    category: campaign.category,
    destination: campaign.destination ?? '',
    image: campaign.imageKey ? { key: campaign.imageKey, url: campaign.imageUrl } : null,
    audienceType: audience.type,
    userIds: [...audience.userIds],
    goals: audience.filter.primaryGoal ?? [],
    levels: audience.filter.experienceLevel ?? [],
    onboarding:
      audience.filter.onboardingCompleted === undefined
        ? ''
        : audience.filter.onboardingCompleted
          ? 'completed'
          : 'pending',
  };
}

/** Builds exactly what the API accepts; irrelevant audience fields are dropped. */
export function toContent(state: ComposerState): NotificationContent {
  const filter: AudienceFilter = {};
  if (state.audienceType === 'segment') {
    if (state.goals.length) filter.primaryGoal = state.goals;
    if (state.levels.length) filter.experienceLevel = state.levels;
    if (state.onboarding) filter.onboardingCompleted = state.onboarding === 'completed';
  }
  return {
    title: state.title.trim(),
    body: state.body.trim(),
    category: state.category,
    destination: state.destination || null,
    imageKey: state.image?.key ?? null,
    audience: {
      type: state.audienceType,
      userIds: state.audienceType === 'users' ? state.userIds : [],
      filter,
    },
  };
}

export type ComposerErrors = Partial<Record<'title' | 'body' | 'audience' | 'schedule', string>>;

/**
 * C0/C1 control characters have no place in a push notification (line feeds are allowed in the message only).
 * Same rule as the backend request schema; pasted text is the usual way a tab or other control code sneaks in.
 */
export function hasControlCharacters(value: string, allowNewline: boolean): boolean {
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (allowNewline && code === 10) continue;
    if (code < 32 || (code >= 127 && code <= 159)) return true;
  }
  return false;
}

/** Client-side mirror of the backend rules, for instant feedback. The backend still enforces all of them. */
export function validateComposer(state: ComposerState): ComposerErrors {
  const errors: ComposerErrors = {};
  const title = state.title.trim();
  const body = state.body.trim();
  if (!title) errors.title = 'Enter a title.';
  else if (title.length > TITLE_MAX) errors.title = `Keep the title under ${TITLE_MAX} characters.`;
  else if (hasControlCharacters(title, false)) errors.title = 'Remove the control characters from the title.';
  if (!body) errors.body = 'Enter a message.';
  else if (body.length > BODY_MAX) errors.body = `Keep the message under ${BODY_MAX} characters.`;
  else if (hasControlCharacters(body, true)) errors.body = 'Remove the control characters from the message.';

  if (state.audienceType === 'users') {
    if (state.userIds.length === 0) errors.audience = 'Select at least one user.';
    else if (state.userIds.length > MAX_AUDIENCE_USERS) errors.audience = `Select at most ${MAX_AUDIENCE_USERS} users.`;
  } else if (state.audienceType === 'segment') {
    if (!state.goals.length && !state.levels.length && !state.onboarding) {
      errors.audience = 'Choose at least one segment filter, or target all users.';
    }
  }
  return errors;
}

export function validateSchedule(scheduledAtLocal: string, now: Date = new Date()): string | null {
  if (!scheduledAtLocal) return 'Choose when to send.';
  const at = new Date(scheduledAtLocal);
  if (Number.isNaN(at.getTime())) return 'Enter a valid date and time.';
  const delta = at.getTime() - now.getTime();
  if (delta < MIN_SCHEDULE_LEAD_MS) return 'Schedule at least a minute from now.';
  if (delta > MAX_SCHEDULE_HORIZON_MS) return 'Schedule no more than 90 days ahead.';
  return null;
}

/** `<input type="datetime-local">` value (local wall time) → ISO instant for the API. */
export const localInputToIso = (value: string): string => new Date(value).toISOString();

/** ISO instant → `<input type="datetime-local">` value in the browser's time zone. */
export function isoToLocalInput(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Runs at most one task at a time; a second call while one is running is refused instead of queued.
 *
 * Why not just a `busy` state flag: React applies state on the next render, so two clicks (or a held Enter key)
 * that arrive before it can both read "not busy" and both send. This flag flips synchronously. The backend's
 * Idempotency-Key is the second line of defence; this keeps the duplicate from being sent at all.
 */
export function createSingleFlight() {
  let active = false;
  return {
    async run<T>(task: () => Promise<T>): Promise<{ ran: true; value: T } | { ran: false }> {
      if (active) return { ran: false };
      active = true;
      try {
        return { ran: true, value: await task() };
      } finally {
        // Released on failure too, so the admin can retry after an error.
        active = false;
      }
    },
  };
}

export interface ConfirmationInput {
  title: string;
  eligibleUsers: number;
  pushableDevices: number;
  scheduled: boolean;
}

/**
 * Text for the "are you sure" dialog. It says what will be sent, not what will arrive: FCM accepting a message
 * does not prove the phone showed it, so the dialog never promises delivery.
 */
export function confirmationSummary({ title, eligibleUsers, pushableDevices, scheduled }: ConfirmationInput): string {
  const users = `${eligibleUsers.toLocaleString()} user${eligibleUsers === 1 ? '' : 's'}`;
  const where =
    pushableDevices > 0
      ? ` on up to ${pushableDevices.toLocaleString()} device${pushableDevices === 1 ? '' : 's'}`
      : ' in their in-app inbox only (no push devices)';
  return scheduled
    ? `“${title}” will be sent to ${users}${where} at the scheduled time. You can cancel it until it starts sending. Delivery to a phone is not guaranteed.`
    : `“${title}” will be sent to ${users}${where}. It cannot be recalled once sent, and delivery to a phone is not guaranteed.`;
}

export interface SendFailure {
  message: string;
  /**
   * True when the server may have queued the notification even though the answer never arrived (dropped
   * connection, timeout, server error). The screen then refreshes the list so the admin can see for themselves.
   */
  outcomeUnknown: boolean;
}

/**
 * Turns a failed send/schedule call into an honest message. The generic API messages ("Request timed out",
 * "Something went wrong") are fine for a read but misleading for a send, where the request may have succeeded.
 * Matches on the backend's stable error codes, never on message text.
 */
export function describeSendFailure(error: unknown): SendFailure {
  const { code, status, message } =
    typeof error === 'object' && error !== null
      ? (error as { code?: unknown; status?: unknown; message?: unknown })
      : ({} as { code?: unknown; status?: unknown; message?: unknown });
  const text = typeof message === 'string' && message ? message : 'Failed to send the notification.';

  switch (code) {
    case 'NETWORK_ERROR':
    case 'TIMEOUT':
      return {
        outcomeUnknown: true,
        message:
          'The connection dropped before the server answered, so it is not known whether this was sent. ' +
          'Check the notification list before trying again. Retrying without changes will not send it twice.',
      };
    case 'IDEMPOTENCY_REQUEST_IN_PROGRESS':
      return {
        outcomeUnknown: true,
        message:
          'The previous attempt is still being processed. Wait a moment and check the notification list before sending again.',
      };
    case 'IDEMPOTENCY_KEY_REUSED':
      return {
        outcomeUnknown: true,
        message:
          'This notification was already submitted with different settings. Check the notification list before sending again.',
      };
    case 'PUSH_NOT_CONFIGURED':
      return {
        outcomeUnknown: false,
        message: 'Push delivery is not configured on this server, so nothing was sent. You can still save this as a draft.',
      };
    case 'BULK_CONFIRMATION_REQUIRED':
      return {
        outcomeUnknown: false,
        message: 'This audience needs bulk confirmation. Nothing was sent. Go back, review the audience and send again.',
      };
    case 'NO_ELIGIBLE_RECIPIENTS':
      return {
        outcomeUnknown: false,
        message: 'No active users match this audience and their notification preferences. Nothing was sent.',
      };
    // The image is checked before anything is queued, so for all three nothing was sent.
    case 'IMAGE_NOT_FOUND':
      return {
        outcomeUnknown: false,
        message: 'The image for this notification could not be found, so nothing was sent. Remove it or upload it again.',
      };
    case 'IMAGE_STORAGE_NOT_CONFIGURED':
      return {
        outcomeUnknown: false,
        message: 'Image uploads are not set up on this server, so nothing was sent. Remove the image to send text only.',
      };
    case 'IMAGE_STORAGE_UNAVAILABLE':
      return {
        outcomeUnknown: false,
        message: 'The image could not be checked right now, so nothing was sent. Try again in a moment.',
      };
    default:
      if (typeof status === 'number' && status >= 500) {
        return {
          outcomeUnknown: true,
          message: 'Something went wrong on the server. Check the notification list before trying again.',
        };
      }
      return { outcomeUnknown: false, message: text };
  }
}

export interface DeliveryBreakdown {
  /** FCM took it, device has not confirmed. */
  accepted: number;
  /** The app confirmed it. */
  received: number;
  /** Still queued or being retried. */
  inProgress: number;
  /** Will not be delivered. */
  failed: number;
  /** Validated by FCM in dry-run mode only. */
  dryRun: number;
}

export function breakdown(counts: DeliveryCounts): DeliveryBreakdown {
  return {
    accepted: counts.accepted,
    received: counts.received,
    inProgress: counts.pending + counts.processing,
    failed: counts.failed + counts.invalidToken,
    dryRun: counts.dryRun,
  };
}

/**
 * One honest sentence about the outcome. "Accepted" is never described as "delivered":
 * FCM accepting a message does not prove it reached or was shown on the phone.
 */
export function outcomeSummary(campaign: NotificationCampaign): string {
  const counts = campaign.deliveries;
  switch (campaign.status) {
    case 'draft':
      return 'Not sent yet.';
    case 'cancelled':
      return 'Cancelled before sending.';
    case 'scheduled':
      return 'Waiting for the scheduled time.';
    default:
      break;
  }
  if (!counts || counts.total === 0) {
    return campaign.status === 'sending'
      ? 'Preparing recipients…'
      : 'Saved to users’ inboxes. No registered devices, so no push was attempted.';
  }
  const b = breakdown(counts);
  const parts: string[] = [];
  if (b.received) parts.push(`${b.received} confirmed on device`);
  if (b.accepted) parts.push(`${b.accepted} accepted by FCM (not yet confirmed)`);
  if (b.dryRun) parts.push(`${b.dryRun} validated only (dry run, nothing was delivered)`);
  if (b.inProgress) parts.push(`${b.inProgress} still sending or retrying`);
  if (b.failed) parts.push(`${b.failed} failed`);
  return parts.join(' · ');
}
