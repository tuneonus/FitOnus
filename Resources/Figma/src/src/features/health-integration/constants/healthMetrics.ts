export type MetricAvailability = 'available' | 'noData' | 'unavailable';

export type HealthMetric = {
  key: string;
  label: string;
  group: 'Activity' | 'Heart' | 'Sleep' | 'Body' | 'Vitals' | 'Other';
  availability: MetricAvailability;
  source?: string;
  note?: string;
};

/** Normalized metric catalog shared by Apple HealthKit and Android Health Connect. */
export const healthMetrics: HealthMetric[] = [
{ key: 'steps', label: 'Steps', group: 'Activity', availability: 'available', source: 'iPhone + Watch' },
{ key: 'distance', label: 'Distance', group: 'Activity', availability: 'available', source: 'Watch' },
{ key: 'activeCalories', label: 'Active calories', group: 'Activity', availability: 'available', source: 'Watch' },
{ key: 'restingCalories', label: 'Resting calories', group: 'Activity', availability: 'available', source: 'Watch' },
{ key: 'workouts', label: 'Workouts', group: 'Activity', availability: 'available', source: 'Watch' },
{ key: 'heartRate', label: 'Heart rate', group: 'Heart', availability: 'available', source: 'Watch' },
{ key: 'restingHeartRate', label: 'Resting heart rate', group: 'Heart', availability: 'available', source: 'Watch' },
{ key: 'walkingHeartRate', label: 'Walking heart rate', group: 'Heart', availability: 'available', source: 'Watch' },
{ key: 'hrv', label: 'Heart rate variability', group: 'Heart', availability: 'available', source: 'Watch' },
{ key: 'sleep', label: 'Sleep analysis', group: 'Sleep', availability: 'available', source: 'Watch' },
{ key: 'respiratoryRate', label: 'Respiratory rate', group: 'Vitals', availability: 'available', source: 'Watch' },
{ key: 'bloodOxygen', label: 'Blood oxygen', group: 'Vitals', availability: 'noData', note: 'Allowed, but no readings in 30 days' },
{ key: 'bloodPressure', label: 'Blood pressure', group: 'Vitals', availability: 'unavailable', note: 'Needs a compatible cuff' },
{ key: 'bloodGlucose', label: 'Blood glucose', group: 'Vitals', availability: 'unavailable', note: 'Needs a glucose monitor' },
{ key: 'weight', label: 'Weight', group: 'Body', availability: 'available', source: 'Manual entries' },
{ key: 'bodyFat', label: 'Body fat %', group: 'Body', availability: 'noData', note: 'Add a smart scale or log manually' },
{ key: 'bmi', label: 'BMI', group: 'Body', availability: 'available', source: 'Calculated' },
{ key: 'mindfulness', label: 'Mindfulness', group: 'Other', availability: 'noData', note: 'No sessions recorded' }];


export const healthConnectApps = [
{ name: 'Google Fit', status: 'connected' as const, detail: 'Steps, workouts, heart rate' },
{ name: 'Samsung Health', status: 'connected' as const, detail: 'Sleep, heart rate, weight' },
{ name: 'Fitbit', status: 'available' as const, detail: 'Installed · not sharing yet' },
{ name: 'Garmin Connect', status: 'notInstalled' as const, detail: 'Not installed' },
{ name: 'Oura', status: 'notInstalled' as const, detail: 'Not installed' }];