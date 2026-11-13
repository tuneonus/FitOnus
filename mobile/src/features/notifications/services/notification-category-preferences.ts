import {
  SERVER_CATEGORIES,
  type InboxApi,
  type ServerCategory,
  type ServerCategoryPreferences,
} from './notification-inbox-api';

export const CATEGORY_COPY: Readonly<Record<ServerCategory, { label: string; description: string }>> = {
  announcements: { label: 'Announcements', description: 'News and updates from the OnusFit team' },
  challenges: { label: 'Challenges', description: 'New challenges and reward updates' },
  coach_insights: { label: 'Coach insights', description: 'Tips and summaries from your AI coach' },
  goal_updates: { label: 'Goal updates', description: 'Progress and milestones on your goals' },
};

export const ALL_ENABLED: ServerCategoryPreferences = Object.fromEntries(
  SERVER_CATEGORIES.map((key) => [key, true]),
) as ServerCategoryPreferences;

export interface CategoryPreferenceState {
  categories: ServerCategoryPreferences;
  /** False until the server answered once; the toggles are not interactive before that. */
  loaded: boolean;
  /** Set when the last load or save failed. */
  error: boolean;
}

export interface CategoryPreferenceController {
  getState: () => CategoryPreferenceState;
  subscribe: (listener: (state: CategoryPreferenceState) => void) => () => void;
  load: () => Promise<void>;
  /** Flips one category: optimistic, rolled back if the server refuses. Resolves true when saved. */
  toggle: (key: ServerCategory) => Promise<boolean>;
}

/**
 * Keeps the per-category push choices in step with the server. The master "allow notifications" switch is NOT
 * handled here: it already syncs through the existing settings endpoint (`user_settings.notifications_enabled`),
 * which the backend uses for pushes too.
 */
export function createCategoryPreferenceController(api: InboxApi): CategoryPreferenceController {
  let state: CategoryPreferenceState = { categories: { ...ALL_ENABLED }, loaded: false, error: false };
  const listeners = new Set<(s: CategoryPreferenceState) => void>();
  // Saves are applied in order so two quick taps cannot leave the server with the older value.
  let queue: Promise<unknown> = Promise.resolve();

  const set = (next: CategoryPreferenceState) => {
    state = next;
    listeners.forEach((listener) => listener(next));
  };

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    async load() {
      try {
        const snapshot = await api.getPreferences();
        set({ categories: snapshot.categories, loaded: true, error: false });
      } catch {
        set({ ...state, error: true });
      }
    },
    toggle(key) {
      if (!state.loaded) return Promise.resolve(false);
      const previous = state.categories[key];
      const next = !previous;
      set({ ...state, categories: { ...state.categories, [key]: next } });

      const save = queue.then(async () => {
        try {
          const snapshot = await api.updatePreferences({ categories: { [key]: next } });
          set({ categories: snapshot.categories, loaded: true, error: false });
          return true;
        } catch {
          set({ ...state, categories: { ...state.categories, [key]: previous }, error: true });
          return false;
        }
      });
      queue = save;
      return save;
    },
  };
}
