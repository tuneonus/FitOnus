import type { StoreApi } from 'zustand';
import { useAuthStore } from '../features/auth/stores/auth-store';

let generation = 0;
const resets = new Set<() => void>();

useAuthStore.subscribe((state, previous) => {
  if (state.user?.id !== previous.user?.id || state.isAuthenticated !== previous.isAuthenticated) {
    generation++;
    resets.forEach((reset) => reset());
  }
});

export class SessionChangedError extends Error {
  constructor() {
    super('Your session changed. Please try again.');
    this.name = 'SessionChangedError';
  }
}

/** Capture before starting asynchronous work, including local storage reads. */
export function captureUserSession() {
  const captured = generation;
  const userId = useAuthStore.getState().user?.id;
  const isCurrent = () => captured === generation;
  return {
    userId,
    isCurrent,
    assertCurrent: () => {
      if (!isCurrent()) throw new SessionChangedError();
    },
  };
}

/** Clear every loaded user store on logout, expiry, and account switching. */
export function registerUserStore<T>(store: StoreApi<T>, reset?: () => void) {
  resets.add(reset ?? (() => store.setState(store.getInitialState(), true)));
}

export function sessionSetter<T>(
  set: StoreApi<T>['setState'],
  session: ReturnType<typeof captureUserSession>,
) {
  return ((...args: unknown[]) => {
    if (session.isCurrent()) (set as (...values: unknown[]) => void)(...args);
  }) as typeof set;
}
