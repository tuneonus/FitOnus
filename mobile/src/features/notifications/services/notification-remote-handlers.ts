import type { InboxApi } from './notification-inbox-api';
import type { RemotePushPayload } from './notification-routing';

export interface RemoteHandlerDeps {
  api: InboxApi;
  /** Refetch the inbox from the server (the store's `syncInbox`). */
  syncInbox: () => Promise<void>;
  /** Optimistically mark an already-loaded item as read in the store. */
  markReadLocally: (id: string) => void;
}

const swallow = (promise: Promise<unknown>): void => {
  promise.catch(() => {
    // Receipts and read-marks are best-effort: the inbox is re-synced on the next foreground.
  });
};

/**
 * Reactions to server pushes. Local reminders never get here (they carry no `notificationId`), which is what keeps
 * a reminder and a server message from being counted twice.
 */
export function createRemoteHandlers({ api, syncInbox, markReadLocally }: RemoteHandlerDeps) {
  return {
    /** The push arrived while the app was open: confirm receipt and show it in the inbox. */
    onReceived(payload: RemotePushPayload): void {
      swallow(api.confirmReceived(payload.notificationId));
      swallow(syncInbox());
    },

    /** The user tapped the push: it was clearly received, and they have now read it. */
    onOpened(payload: RemotePushPayload): void {
      markReadLocally(payload.notificationId);
      // Receipt first: the "read" call also upgrades the delivery, but this keeps the two facts independent.
      swallow(api.confirmReceived(payload.notificationId));
      swallow(api.markRead(payload.notificationId));
      swallow(syncInbox());
    },
  };
}
