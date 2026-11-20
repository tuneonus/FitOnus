/**
 * What to do with a queued nutrition entry whose upload failed.
 *
 * - `retry`: the entry is fine, the attempt was not (no connection, a server problem, a rate limit, or a
 *   sign-in / permission problem that has to do with the session rather than the entry). Keep it queued.
 * - `rejected`: the server looked at this exact entry and refused it (a 4xx that will not change on a retry).
 *   Keeping it queued would block the queue forever, and silently deleting it would lose what the member logged,
 *   so it moves to a "couldn't be saved" list the member can see.
 *
 * 409 is handled separately by the caller: it can mean "already saved" or "that id belongs to someone else".
 */
export type SyncFailureAction = 'retry' | 'rejected';

export function classifySyncFailure(status: number | undefined): SyncFailureAction {
  // No response at all: offline, a timeout, DNS. Never the entry's fault.
  if (typeof status !== 'number') return 'retry';
  if (status >= 500) return 'retry';
  // 401/403: the session or account, not the entry; 408/425/429: try again later.
  if (status === 401 || status === 403 || status === 408 || status === 425 || status === 429) return 'retry';
  return status >= 400 ? 'rejected' : 'retry';
}

const MAX_REASON_LENGTH = 160;

/** A short reason a member can read: the server's own message for the entry, else the status. */
export function rejectionReason(status: number, serverMessage: unknown): string {
  const message = typeof serverMessage === 'string' ? serverMessage.replace(/\s+/g, ' ').trim() : '';
  const text = message || `The server refused this entry (error ${status}).`;
  return text.length > MAX_REASON_LENGTH ? `${text.slice(0, MAX_REASON_LENGTH - 1)}…` : text;
}
