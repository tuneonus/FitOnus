/**
 * Session-end cleanup registry.
 *
 * `AuthService.logout` cannot import the push runtime directly: that would pull
 * native modules into every module that imports auth (and into the node test
 * runner). Instead the notification bridge registers its cleanup here at app
 * start, and the auth service only has to call `runSessionEndCleanups()`.
 * With nothing registered this is a no-op, so it is safe everywhere.
 */
export type SessionEndCleanup = () => Promise<void>;

const cleanups = new Set<SessionEndCleanup>();

export function registerSessionEndCleanup(cleanup: SessionEndCleanup): () => void {
  cleanups.add(cleanup);
  return () => {
    cleanups.delete(cleanup);
  };
}

/**
 * Run every registered cleanup. Never rejects and never blocks longer than
 * `timeoutMs`, so a slow or failing cleanup cannot prevent a user from logging out.
 */
export async function runSessionEndCleanups(timeoutMs = 4000): Promise<void> {
  if (cleanups.size === 0) return;

  const all = Promise.allSettled([...cleanups].map((cleanup) => Promise.resolve().then(cleanup)));
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, timeoutMs);
  });

  try {
    await Promise.race([all.then(() => undefined), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
