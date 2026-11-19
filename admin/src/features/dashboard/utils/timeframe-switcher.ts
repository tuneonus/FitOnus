import type { DashboardStats, DashboardTimeframe } from '../types';

export interface TimeframeSwitcherState {
  /** What the admin picked in the selector. */
  selected: DashboardTimeframe;
  /** The timeframe the stats currently on screen were actually requested for. */
  loaded: DashboardTimeframe;
  isSwitching: boolean;
  error: string | null;
}

interface TimeframeSwitcherOptions {
  initial: DashboardTimeframe;
  fetchStats: (timeframe: DashboardTimeframe) => Promise<DashboardStats>;
  /** Receives stats for a timeframe the admin switched to. */
  onStats: (stats: DashboardStats, timeframe: DashboardTimeframe) => void;
  onState: (state: TimeframeSwitcherState) => void;
}

/**
 * Owns "which timeframe is selected and which one is on screen". Selecting a different timeframe requests
 * that timeframe from the backend; the labels and totals on screen follow `loaded`, never `selected`, so
 * they can't describe a window other than the one the data is for.
 *
 *  - A response that arrives after a newer selection is discarded.
 *  - If the request fails the selection reverts to what is still on screen and the error is reported.
 *
 * It is plain TypeScript (no React) so the hook stays a thin adapter and this can be tested directly.
 */
export function createTimeframeSwitcher(options: TimeframeSwitcherOptions) {
  let state: TimeframeSwitcherState = {
    selected: options.initial,
    loaded: options.initial,
    isSwitching: false,
    error: null,
  };
  let latestRequest = 0;

  const update = (patch: Partial<TimeframeSwitcherState>) => {
    state = { ...state, ...patch };
    options.onState(state);
  };

  return {
    getState: () => state,

    async select(timeframe: DashboardTimeframe): Promise<void> {
      if (timeframe === state.selected) return;

      // Going back to the timeframe that is still on screen: drop the pending request, nothing to load.
      if (timeframe === state.loaded) {
        latestRequest += 1;
        update({ selected: timeframe, isSwitching: false, error: null });
        return;
      }

      const request = ++latestRequest;
      update({ selected: timeframe, isSwitching: true, error: null });

      try {
        const stats = await options.fetchStats(timeframe);
        if (request !== latestRequest) return;
        options.onStats(stats, timeframe);
        update({ loaded: timeframe, isSwitching: false });
      } catch (err) {
        if (request !== latestRequest) return;
        update({
          selected: state.loaded,
          isSwitching: false,
          error: err instanceof Error ? err.message : 'Failed to load metrics for that timeframe.',
        });
      }
    },
  };
}
