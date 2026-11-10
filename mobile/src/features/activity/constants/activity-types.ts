import { Bike, Footprints, User, Waves } from 'lucide-react-native';

export type ActivityType = 'steps' | 'walking' | 'running' | 'cycling' | 'swimming';

// Display metadata only. This backend does not ingest activity-type or hourly telemetry yet.
const empty = {
  week: '—',
  detail: 'No activity records available',
  unit: 'km',
  series: [] as { label: string; value: number }[],
  sessions: [] as { date: string; title: string; stats: string }[],
};
export const activityTypes = {
  steps: { ...empty, label: 'Steps', icon: Footprints, unit: 'steps' },
  walking: { ...empty, label: 'Walking', icon: User },
  running: { ...empty, label: 'Running', icon: Footprints },
  cycling: { ...empty, label: 'Cycling', icon: Bike },
  swimming: { ...empty, label: 'Swimming', icon: Waves, unit: 'm' },
};
