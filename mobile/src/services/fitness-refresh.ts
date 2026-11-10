import { queryClient } from '../providers/query-provider';

const listeners = new Set<() => void>();
export function onFitnessRefresh(listener: () => void) {
  listeners.add(listener);
}

/** Shared query prefix already used by workout, diary, and Home screens. */
export function refreshFitnessQueries() {
  void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
  void queryClient.invalidateQueries({ queryKey: ['coach-insights'] });
  listeners.forEach((listener) => listener());
}
