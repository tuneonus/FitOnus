import { BikeIcon, FootprintsIcon, PersonStandingIcon, WavesIcon } from 'lucide-react';

export type ActivityType = 'steps' | 'walking' | 'running' | 'cycling' | 'swimming';

export const todayActivity = {
  steps: 2180,
  stepGoal: 10000,
  distanceKm: 1.6,
  floors: 4,
  activeCalories: 214,
  activeMinutes: 18
};

export const hourlySteps = [
{ label: '6a', value: 120 }, { label: '7a', value: 940 }, { label: '8a', value: 610 }, { label: '9a', value: 510 },
{ label: '10a', value: 0 }, { label: '11a', value: 0 }, { label: '12p', value: 0 }, { label: '1p', value: 0 }];


export const weeklyActivity = [
{ label: 'Sat', value: 11240 }, { label: 'Sun', value: 7310 }, { label: 'Mon', value: 8420 }, { label: 'Tue', value: 9870 },
{ label: 'Wed', value: 6120 }, { label: 'Thu', value: 10450 }, { label: 'Fri', value: 2180 }];


export const activityTypes: Record<
  ActivityType,
  {label: string;icon: typeof FootprintsIcon;week: string;detail: string;unit: string;series: {label: string;value: number;}[];sessions: {date: string;title: string;stats: string;source: 'synced' | 'manual';}[];}> =
{
  steps: {
    label: 'Steps', icon: FootprintsIcon, week: '55,590', detail: 'Avg 7,941/day', unit: 'steps', series: weeklyActivity,
    sessions: []
  },
  walking: {
    label: 'Walking', icon: PersonStandingIcon, week: '24.8 km', detail: '6 walks · 4h 52m', unit: 'km',
    series: [{ label: 'Sat', value: 5.2 }, { label: 'Sun', value: 3.1 }, { label: 'Mon', value: 3.8 }, { label: 'Tue', value: 4.4 }, { label: 'Wed', value: 2.6 }, { label: 'Thu', value: 4.5 }, { label: 'Fri', value: 1.2 }],
    sessions: [
    { date: 'Today 7:05 AM', title: 'Morning walk', stats: '1.2 km · 15 min · 98 bpm avg', source: 'synced' },
    { date: 'Thu 6:40 PM', title: 'Evening walk', stats: '3.4 km · 41 min', source: 'synced' }]

  },
  running: {
    label: 'Running', icon: FootprintsIcon, week: '5.0 km', detail: '1 run · 31 min', unit: 'km',
    series: [{ label: 'Sat', value: 0 }, { label: 'Sun', value: 0 }, { label: 'Mon', value: 0 }, { label: 'Tue', value: 0 }, { label: 'Wed', value: 0 }, { label: 'Thu', value: 5.02 }, { label: 'Fri', value: 0 }],
    sessions: [{ date: 'Thu, Oct 1', title: 'Easy run', stats: '5.02 km · 6:10 /km · 148 bpm', source: 'synced' }]
  },
  cycling: {
    label: 'Cycling', icon: BikeIcon, week: '18.4 km', detail: '1 ride · 52 min', unit: 'km',
    series: [{ label: 'Sat', value: 0 }, { label: 'Sun', value: 18.4 }, { label: 'Mon', value: 0 }, { label: 'Tue', value: 0 }, { label: 'Wed', value: 0 }, { label: 'Thu', value: 0 }, { label: 'Fri', value: 0 }],
    sessions: [{ date: 'Sun, Oct 4', title: 'Outdoor ride', stats: '18.4 km · 21.2 km/h · 132 bpm', source: 'synced' }]
  },
  swimming: {
    label: 'Swimming', icon: WavesIcon, week: '0 m', detail: 'No swims this week', unit: 'm',
    series: [],
    sessions: []
  }
};