import { useEffect, useState } from 'react';
import { showToast } from '../../../shared/stores/toastStore';

export function useRestTimer() {
  const [rest, setRest] = useState<{remaining: number;total: number;} | null>(null);

  useEffect(() => {
    if (!rest) return;
    if (rest.remaining <= 0) {
      setRest(null);
      showToast({ message: 'Rest over — next set', tone: 'info' });
      return;
    }
    const t = setTimeout(() => setRest((r) => r ? { ...r, remaining: r.remaining - 1 } : r), 1000);
    return () => clearTimeout(t);
  }, [rest]);

  return {
    rest,
    start: (seconds: number) => setRest({ remaining: seconds, total: seconds }),
    add: (seconds: number) => setRest((r) => r ? { remaining: r.remaining + seconds, total: r.total + seconds } : r),
    skip: () => setRest(null)
  };
}