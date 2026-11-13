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

export interface ComposerState {
  title: string;
  body: string;
  category: NotificationCategory;
  destination: NotificationDestination | '';
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
    audience: {
      type: state.audienceType,
      userIds: state.audienceType === 'users' ? state.userIds : [],
      filter,
    },
  };
}

export type ComposerErrors = Partial<Record<'title' | 'body' | 'audience' | 'schedule', string>>;

/** Client-side mirror of the backend rules, for instant feedback. The backend still enforces all of them. */
export function validateComposer(state: ComposerState): ComposerErrors {
  const errors: ComposerErrors = {};
  const title = state.title.trim();
  const body = state.body.trim();
  if (!title) errors.title = 'Enter a title.';
  else if (title.length > TITLE_MAX) errors.title = `Keep the title under ${TITLE_MAX} characters.`;
  if (!body) errors.body = 'Enter a message.';
  else if (body.length > BODY_MAX) errors.body = `Keep the message under ${BODY_MAX} characters.`;

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
