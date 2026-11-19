import { emptyComposer, type ComposerState } from './logic';
import type { NotificationCategory, NotificationDestination } from './types';

/**
 * Starter content for the composer. A template is only a head start: it prefills the title, message, category and
 * tap destination, and nothing else.
 *
 * Why the catalogue lives in code rather than in the database:
 * - There is no notification-template table or endpoint; adding one needs a migration and a new admin API surface.
 * - A template carries no recipients and no send state, so nothing here can reach a device. Sending still goes
 *   through the existing, permission-checked campaign API after the admin has chosen an audience and confirmed.
 * - The backend has no placeholder substitution, so template text must be complete as written: a `{name}` style
 *   token would be delivered to members literally.
 */
export interface NotificationTemplate {
  id: string;
  /** Shown on the card; admin-facing only, never sent. */
  name: string;
  /** Admin-facing hint about when to use it; never sent. */
  description: string;
  title: string;
  body: string;
  category: NotificationCategory;
  destination: NotificationDestination | null;
}

export const NOTIFICATION_TEMPLATES: readonly NotificationTemplate[] = [
  {
    id: 'new-challenge',
    name: 'New challenge',
    description: 'A challenge is open for members to join.',
    title: 'A new challenge is live',
    body: 'A new challenge has just opened. Join in, track your progress and see how you stack up.',
    category: 'challenges',
    destination: 'challenges',
  },
  {
    id: 'weekly-report',
    name: 'Weekly report',
    description: 'Point members at their weekly summary.',
    title: 'Your weekly report is ready',
    body: 'See how your week went across workouts, nutrition and recovery.',
    category: 'goal_updates',
    destination: 'weekly_report',
  },
  {
    id: 'goal-check-in',
    name: 'Goal check-in',
    description: 'Prompt members to review their goals.',
    title: 'How are your goals going?',
    body: 'Take a minute to review your goals and adjust them so they still fit your week.',
    category: 'goal_updates',
    destination: 'goals',
  },
  {
    id: 'coach-nudge',
    name: 'AI Coach nudge',
    description: 'Invite members to ask the AI Coach something.',
    title: 'Got a question for your coach?',
    body: 'Ask your AI Coach about training, meals or recovery. It is ready when you are.',
    category: 'coach_insights',
    destination: 'coach',
  },
  {
    id: 'product-update',
    name: 'What’s new',
    description: 'General announcement. Edit it to describe the actual update.',
    title: 'What’s new in OnusFit',
    body: 'We have made some improvements to help your training. Open the app to take a look.',
    category: 'announcements',
    destination: 'home',
  },
];

export const findTemplate = (id: string): NotificationTemplate | undefined =>
  NOTIFICATION_TEMPLATES.find((template) => template.id === id);

/**
 * Composer state for a template. The audience is deliberately left at its empty default (hand-picked users, none
 * selected): picking a template never selects recipients, so the admin has to choose them, and the composer's
 * validation refuses to continue until they do. A template can never turn into a send to everyone by itself.
 */
export function composerFromTemplate(template: NotificationTemplate): ComposerState {
  return {
    ...emptyComposer(),
    title: template.title,
    body: template.body,
    category: template.category,
    destination: template.destination ?? '',
  };
}
