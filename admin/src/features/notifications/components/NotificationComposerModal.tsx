'use client';

import React, { useRef, useState } from 'react';
import { AlertCircle, AlertTriangle, ArrowLeft, Loader2, Send } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { useToast } from '@/context/ToastContext';
import { notificationsApi } from '../api';
import {
  BODY_MAX,
  CATEGORY_LABELS,
  DESTINATION_LABELS,
  EXPERIENCE_OPTIONS,
  GOAL_OPTIONS,
  TITLE_MAX,
  audienceSummary,
  composerFromCampaign,
  emptyComposer,
  isoToLocalInput,
  localInputToIso,
  toContent,
  validateComposer,
  validateSchedule,
  type ComposerErrors,
  type ComposerState,
} from '../logic';
import type { AudienceType, NotificationCampaign, NotificationPreview } from '../types';
import { NOTIFICATION_DESTINATIONS, SERVER_CATEGORIES } from '../types';
import { PushPreview } from './PushPreview';
import { UserPicker } from './UserPicker';

interface ComposerModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** An existing draft to edit, or null to start a new notification. */
  draft: NotificationCampaign | null;
  onChanged: () => void;
}

export function NotificationComposerModal({ isOpen, onClose, draft, onChanged }: ComposerModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={draft ? 'Edit notification draft' : 'New notification'}
      description="Compose a push notification, check who it reaches, then send now or schedule it."
      maxWidth="2xl"
    >
      {/* Re-mount per draft so form state never leaks between notifications. */}
      <Composer key={draft?.id ?? 'new'} draft={draft} onClose={onClose} onChanged={onChanged} />
    </Modal>
  );
}

const AUDIENCE_OPTIONS: { value: AudienceType; title: string; hint: string }[] = [
  { value: 'users', title: 'Selected users', hint: 'Pick specific people.' },
  { value: 'segment', title: 'Segment', hint: 'Everyone matching profile filters.' },
  { value: 'all', title: 'All users', hint: 'Every active user who allows this category.' },
];

function Composer({
  draft,
  onClose,
  onChanged,
}: {
  draft: NotificationCampaign | null;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<ComposerState>(() => (draft ? composerFromCampaign(draft) : emptyComposer()));
  const [errors, setErrors] = useState<ComposerErrors>({});
  const [step, setStep] = useState<'compose' | 'review'>('compose');
  const [preview, setPreview] = useState<NotificationPreview | null>(null);
  const [timing, setTiming] = useState<'now' | 'later'>('now');
  const [scheduledLocal, setScheduledLocal] = useState(() =>
    draft?.scheduledAt ? isoToLocalInput(draft.scheduledAt) : '',
  );
  const [busy, setBusy] = useState<'draft' | 'preview' | 'send' | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // The draft's latest known version, so repeated saves don't trip optimistic locking.
  const currentRef = useRef<NotificationCampaign | null>(draft);
  // One key per distinct send attempt: a double click or retry reuses it, an edit starts a new one.
  const keyRef = useRef<string | null>(null);

  const patch = (changes: Partial<ComposerState>) => {
    setForm((prev) => ({ ...prev, ...changes }));
    setPreview(null);
    keyRef.current = null;
  };

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((v) => v !== value) : [...list, value];

  const fail = (err: unknown, fallback: string) => {
    const message = err instanceof Error ? err.message : fallback;
    setFormError(message);
    toast.error(message);
  };

  const saveDraft = async () => {
    const found = validateComposer(form);
    setErrors(found);
    if (Object.keys(found).length > 0 || busy) return;
    setBusy('draft');
    setFormError(null);
    try {
      const content = toContent(form);
      const saved = currentRef.current
        ? await notificationsApi.update(currentRef.current.id, { ...content, version: currentRef.current.version })
        : await notificationsApi.create({ ...content, mode: 'draft', scheduledAt: null, confirmBulk: false });
      currentRef.current = saved;
      toast.success('Draft saved.');
      onChanged();
      onClose();
    } catch (err) {
      fail(err, 'Failed to save the draft.');
    } finally {
      setBusy(null);
    }
  };

  const goToReview = async () => {
    const found = validateComposer(form);
    setErrors(found);
    if (Object.keys(found).length > 0 || busy) return;
    setBusy('preview');
    setFormError(null);
    try {
      setPreview(await notificationsApi.preview(toContent(form)));
      setStep('review');
    } catch (err) {
      fail(err, 'Failed to preview the audience.');
    } finally {
      setBusy(null);
    }
  };

  const launch = async () => {
    if (!preview || busy) return;
    const scheduleError = timing === 'later' ? validateSchedule(scheduledLocal) : null;
    if (scheduleError) {
      setErrors({ schedule: scheduleError });
      setConfirmOpen(false);
      return;
    }
    setBusy('send');
    setFormError(null);
    keyRef.current ??= crypto.randomUUID();
    const scheduledAt = timing === 'later' ? localInputToIso(scheduledLocal) : null;
    try {
      const content = toContent(form);
      if (currentRef.current) {
        // Persist the latest edits to the draft first, then queue it.
        currentRef.current = await notificationsApi.update(currentRef.current.id, {
          ...content,
          version: currentRef.current.version,
        });
        await notificationsApi.send(
          currentRef.current.id,
          { scheduledAt, confirmBulk: preview.requiresConfirmation },
          keyRef.current,
        );
      } else {
        await notificationsApi.create(
          {
            ...content,
            mode: timing === 'later' ? 'schedule' : 'send_now',
            scheduledAt,
            confirmBulk: preview.requiresConfirmation,
          },
          keyRef.current,
        );
      }
      toast.success(timing === 'later' ? 'Notification scheduled.' : 'Notification queued for sending.');
      onChanged();
      onClose();
    } catch (err) {
      fail(err, 'Failed to send the notification.');
      setConfirmOpen(false);
    } finally {
      setBusy(null);
    }
  };

  const content = toContent(form);
  const eligible = preview?.audience.eligibleUsers ?? 0;
  const blockedReason = !preview
    ? null
    : !preview.pushAvailable
      ? 'Push delivery is not configured on this server, so this notification cannot be sent. You can still save it as a draft.'
      : eligible === 0
        ? 'No active users match this audience and their notification preferences.'
        : null;

  return (
    <>
      {formError && (
        <div role="alert" className="alert alert-error mb-4">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>{formError}</div>
        </div>
      )}

      {step === 'compose' ? (
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            void goToReview();
          }}
        >
          <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
            <div className="space-y-4">
              <div>
                <label htmlFor="notif-title" className="field-label">
                  Title <span className="text-rose-300" aria-hidden="true">*</span>
                </label>
                <input
                  id="notif-title"
                  type="text"
                  value={form.title}
                  maxLength={TITLE_MAX}
                  onChange={(e) => patch({ title: e.target.value })}
                  className={`input ${errors.title ? 'input-invalid' : ''}`}
                  placeholder="e.g. New weekly challenge is live"
                  aria-invalid={Boolean(errors.title)}
                />
                {errors.title ? (
                  <p className="field-error">{errors.title}</p>
                ) : (
                  <p className="field-hint tabular-nums">{form.title.trim().length}/{TITLE_MAX}</p>
                )}
              </div>

              <div>
                <label htmlFor="notif-body" className="field-label">
                  Message <span className="text-rose-300" aria-hidden="true">*</span>
                </label>
                <textarea
                  id="notif-body"
                  rows={4}
                  value={form.body}
                  maxLength={BODY_MAX}
                  onChange={(e) => patch({ body: e.target.value })}
                  className={`input ${errors.body ? 'input-invalid' : ''}`}
                  placeholder="What should people know?"
                  aria-invalid={Boolean(errors.body)}
                />
                {errors.body ? (
                  <p className="field-error">{errors.body}</p>
                ) : (
                  <p className="field-hint tabular-nums">{form.body.trim().length}/{BODY_MAX}</p>
                )}
              </div>

              <div className="grid gap-3.5 sm:grid-cols-2">
                <div>
                  <label htmlFor="notif-category" className="field-label">Category</label>
                  <select
                    id="notif-category"
                    value={form.category}
                    onChange={(e) => patch({ category: e.target.value as ComposerState['category'] })}
                    className="input"
                  >
                    {SERVER_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                    ))}
                  </select>
                  <p className="field-hint">Users can switch each category off in the app.</p>
                </div>
                <div>
                  <label htmlFor="notif-destination" className="field-label">When tapped, open</label>
                  <select
                    id="notif-destination"
                    value={form.destination}
                    onChange={(e) => patch({ destination: e.target.value as ComposerState['destination'] })}
                    className="input"
                  >
                    <option value="">Just open the app</option>
                    {NOTIFICATION_DESTINATIONS.map((d) => (
                      <option key={d} value={d}>{DESTINATION_LABELS[d]}</option>
                    ))}
                  </select>
                  <p className="field-hint">Only screens inside the app can be chosen.</p>
                </div>
              </div>
            </div>

            <div className="space-y-2 lg:pt-5">
              <p className="eyebrow">Preview</p>
              <PushPreview title={content.title} body={content.body} destination={content.destination} />
            </div>
          </div>

          <fieldset className="space-y-3">
            <legend className="field-label">Who should receive it?</legend>
            <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Audience">
              {AUDIENCE_OPTIONS.map((option) => {
                const active = form.audienceType === option.value;
                return (
                  <label
                    key={option.value}
                    className={`cursor-pointer rounded-lg border p-3 transition-colors ${
                      active ? 'border-brand-500/70 bg-brand-500/10' : 'border-ink-700 bg-ink-950 hover:border-ink-600'
                    }`}
                  >
                    <input
                      type="radio"
                      name="notif-audience"
                      className="sr-only"
                      checked={active}
                      onChange={() => patch({ audienceType: option.value })}
                    />
                    <span className="block text-sm font-medium text-white">{option.title}</span>
                    <span className="mt-0.5 block text-xs text-ink-400">{option.hint}</span>
                  </label>
                );
              })}
            </div>

            {form.audienceType === 'users' && (
              <UserPicker selectedIds={form.userIds} onChange={(userIds) => patch({ userIds })} />
            )}

            {form.audienceType === 'segment' && (
              <div className="card-inset space-y-4 p-4">
                <div>
                  <p className="field-label">Fitness goal</p>
                  <div className="flex flex-wrap gap-2">
                    {GOAL_OPTIONS.map((o) => (
                      <label key={o.value} className="inline-flex items-center gap-1.5 text-xs text-ink-200">
                        <input
                          type="checkbox"
                          checked={form.goals.includes(o.value)}
                          onChange={() => patch({ goals: toggle(form.goals, o.value) })}
                        />
                        {o.label}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="field-label">Experience level</p>
                  <div className="flex flex-wrap gap-2">
                    {EXPERIENCE_OPTIONS.map((o) => (
                      <label key={o.value} className="inline-flex items-center gap-1.5 text-xs text-ink-200">
                        <input
                          type="checkbox"
                          checked={form.levels.includes(o.value)}
                          onChange={() => patch({ levels: toggle(form.levels, o.value) })}
                        />
                        {o.label}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label htmlFor="notif-onboarding" className="field-label">Onboarding</label>
                  <select
                    id="notif-onboarding"
                    value={form.onboarding}
                    onChange={(e) => patch({ onboarding: e.target.value as ComposerState['onboarding'] })}
                    className="input sm:w-60"
                  >
                    <option value="">Any</option>
                    <option value="completed">Completed onboarding</option>
                    <option value="pending">Not finished onboarding</option>
                  </select>
                </div>
              </div>
            )}

            {errors.audience && <p className="field-error">{errors.audience}</p>}
          </fieldset>

          <div className="form-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy !== null}>
              Cancel
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => void saveDraft()} disabled={busy !== null}>
              {busy === 'draft' && <Loader2 className="h-4 w-4 animate-spin" />}
              Save draft
            </button>
            <button type="submit" className="btn btn-primary" disabled={busy !== null}>
              {busy === 'preview' && <Loader2 className="h-4 w-4 animate-spin" />}
              Review &amp; send
            </button>
          </div>
        </form>
      ) : (
        preview && (
          <div className="space-y-5">
            <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
              <div className="space-y-4">
                <div className="card-inset p-4">
                  <p className="eyebrow">Audience</p>
                  <p className="mt-1 text-sm font-medium text-white">{audienceSummary(content.audience)}</p>
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
                    <Stat label="Matching users" value={preview.audience.matchedUsers} />
                    <Stat label="Allow this category" value={preview.audience.eligibleUsers} />
                    <Stat label="Will get a push" value={preview.audience.pushableUsers} />
                    <Stat label="Devices" value={preview.audience.pushableDevices} />
                  </dl>
                  {preview.audience.eligibleUsers > preview.audience.pushableUsers && (
                    <p className="field-hint">
                      {preview.audience.eligibleUsers - preview.audience.pushableUsers} eligible user(s) have no
                      registered device or have push turned off. They still receive it in their in-app inbox.
                    </p>
                  )}
                </div>

                {blockedReason && (
                  <div role="alert" className="alert alert-warning">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    <div>{blockedReason}</div>
                  </div>
                )}

                <fieldset className="space-y-2">
                  <legend className="field-label">When?</legend>
                  <label className="flex items-center gap-2 text-sm text-ink-100">
                    <input type="radio" name="notif-timing" checked={timing === 'now'} onChange={() => setTiming('now')} />
                    Send now
                  </label>
                  <label className="flex items-center gap-2 text-sm text-ink-100">
                    <input type="radio" name="notif-timing" checked={timing === 'later'} onChange={() => setTiming('later')} />
                    Schedule for later
                  </label>
                  {timing === 'later' && (
                    <div>
                      <label htmlFor="notif-schedule" className="sr-only">Send at</label>
                      <input
                        id="notif-schedule"
                        type="datetime-local"
                        value={scheduledLocal}
                        onChange={(e) => {
                          setScheduledLocal(e.target.value);
                          setErrors({});
                        }}
                        className={`input sm:w-64 ${errors.schedule ? 'input-invalid' : ''}`}
                      />
                      {errors.schedule ? (
                        <p className="field-error">{errors.schedule}</p>
                      ) : (
                        <p className="field-hint">Uses your browser’s time zone. Between 1 minute and 90 days ahead.</p>
                      )}
                    </div>
                  )}
                </fieldset>
              </div>

              <div className="space-y-2">
                <p className="eyebrow">Preview</p>
                <PushPreview title={preview.push.title} body={preview.push.body} destination={preview.push.destination} />
                <p className="field-hint">Category: {CATEGORY_LABELS[preview.push.category]}</p>
              </div>
            </div>

            <div className="form-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setStep('compose')} disabled={busy !== null}>
                <ArrowLeft className="h-4 w-4" />
                Back to edit
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy !== null || blockedReason !== null}
                onClick={() => {
                  if (timing === 'later') {
                    const scheduleError = validateSchedule(scheduledLocal);
                    if (scheduleError) {
                      setErrors({ schedule: scheduleError });
                      return;
                    }
                  }
                  setConfirmOpen(true);
                }}
              >
                <Send className="h-4 w-4" />
                {timing === 'later' ? 'Schedule…' : 'Send…'}
              </button>
            </div>
          </div>
        )
      )}

      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => void launch()}
        isBusy={busy === 'send'}
        busyLabel="Sending…"
        tone={preview?.requiresConfirmation ? 'warning' : 'primary'}
        title={timing === 'later' ? 'Schedule this notification?' : 'Send this notification?'}
        description={
          preview
            ? `${preview.audience.eligibleUsers.toLocaleString()} user${preview.audience.eligibleUsers === 1 ? '' : 's'} will receive “${content.title}”${
                preview.audience.pushableDevices > 0
                  ? ` on up to ${preview.audience.pushableDevices.toLocaleString()} device${preview.audience.pushableDevices === 1 ? '' : 's'}`
                  : ' in their inbox'
              }.`
            : undefined
        }
        confirmLabel={timing === 'later' ? 'Schedule' : 'Send now'}
      >
        {preview?.requiresConfirmation && (
          <p className="text-sm text-ink-200">
            This is a bulk send ({audienceSummary(content.audience).toLowerCase()}). A sent notification
            cannot be recalled.
          </p>
        )}
      </ConfirmDialog>
    </>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-[11px] text-ink-400">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums text-white">{value.toLocaleString()}</dd>
    </div>
  );
}
