/**
 * Debounced, single-flight trigger for the existing
 * `notificationService.reconcileNotificationSchedules()`.
 *
 * Why it exists: the settings store asks for a reconcile through a by-name
 * `eval('require')` that cannot resolve inside a Metro bundle, so a changed
 * reminder time (or settings arriving after launch) would otherwise only take
 * effect after the next background/foreground cycle. The bridge calls
 * `request()` when the user signs in and when `notificationsEnabled` /
 * `notificationSchedule` change.
 *
 * Guarantees:
 *  - bursts of requests collapse into one run (debounce, saves battery),
 *  - only one reconcile runs at a time, so cancel/schedule sequences never interleave,
 *  - a request that arrives mid-run triggers exactly one trailing run with fresh state,
 *  - a failing reconcile never throws into the app.
 */
export interface ReconcileSchedulerOptions {
  reconcile: () => Promise<unknown>;
  debounceMs?: number;
  setTimer?: (callback: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface ReconcileScheduler {
  request: () => void;
  /** Drop a pending run and any trailing run (e.g. on logout). An in-flight run cannot be aborted. */
  cancel: () => void;
  /** Resolves once nothing is in flight. */
  idle: () => Promise<void>;
}

export function createReconcileScheduler(options: ReconcileSchedulerOptions): ReconcileScheduler {
  const debounceMs = options.debounceMs ?? 400;
  const setTimer = options.setTimer ?? ((callback, ms) => setTimeout(callback, ms));
  const clearTimer =
    options.clearTimer ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));

  let timer: unknown = null;
  let running: Promise<void> | null = null;
  let rerun = false;
  let epoch = 0;

  const start = () => {
    timer = null;
    if (running) {
      rerun = true;
      return;
    }
    const startedIn = epoch;
    const loop = (async () => {
      do {
        rerun = false;
        try {
          await options.reconcile();
        } catch {
          // The caller (settings/auth listeners) must never see a reconcile failure.
        }
      } while (rerun && startedIn === epoch);
    })();
    running = loop.finally(() => {
      running = null;
    });
  };

  return {
    request() {
      if (timer !== null) clearTimer(timer);
      timer = setTimer(start, debounceMs);
    },
    cancel() {
      if (timer !== null) {
        clearTimer(timer);
        timer = null;
      }
      rerun = false;
      epoch += 1;
    },
    async idle() {
      while (running) await running;
    },
  };
}
