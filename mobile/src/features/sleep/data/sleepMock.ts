export type SleepNight = {
  date: string;
  day: string;
  minutes: number;
  deepMin: number;
  remMin: number;
  awakeMin: number;
  score: number;
  bedtime: string;
  wake: string;
  /** Minutes after 10 PM, used for consistency chart. */
  bedOffset: number;
};

export const sleepNights: SleepNight[] = [
{ date: 'Sep 26', day: 'S', minutes: 412, deepMin: 74, remMin: 88, awakeMin: 26, score: 76, bedtime: '11:38 PM', wake: '6:50 AM', bedOffset: 98 },
{ date: 'Sep 27', day: 'S', minutes: 468, deepMin: 90, remMin: 104, awakeMin: 18, score: 86, bedtime: '11:02 PM', wake: '7:10 AM', bedOffset: 62 },
{ date: 'Sep 28', day: 'M', minutes: 395, deepMin: 66, remMin: 82, awakeMin: 31, score: 71, bedtime: '12:05 AM', wake: '6:40 AM', bedOffset: 125 },
{ date: 'Sep 29', day: 'T', minutes: 421, deepMin: 78, remMin: 92, awakeMin: 22, score: 78, bedtime: '11:40 PM', wake: '6:45 AM', bedOffset: 100 },
{ date: 'Sep 30', day: 'W', minutes: 438, deepMin: 82, remMin: 96, awakeMin: 20, score: 81, bedtime: '11:20 PM', wake: '6:40 AM', bedOffset: 80 },
{ date: 'Oct 1', day: 'T', minutes: 402, deepMin: 70, remMin: 84, awakeMin: 28, score: 74, bedtime: '11:52 PM', wake: '6:40 AM', bedOffset: 112 },
{ date: 'Oct 2', day: 'F', minutes: 446, deepMin: 84, remMin: 100, awakeMin: 19, score: 83, bedtime: '11:15 PM', wake: '6:45 AM', bedOffset: 75 },
{ date: 'Oct 3', day: 'S', minutes: 482, deepMin: 92, remMin: 110, awakeMin: 16, score: 88, bedtime: '11:00 PM', wake: '7:15 AM', bedOffset: 60 },
{ date: 'Oct 4', day: 'S', minutes: 455, deepMin: 86, remMin: 102, awakeMin: 21, score: 84, bedtime: '11:30 PM', wake: '7:20 AM', bedOffset: 90 },
{ date: 'Oct 5', day: 'M', minutes: 418, deepMin: 76, remMin: 90, awakeMin: 24, score: 77, bedtime: '11:45 PM', wake: '6:50 AM', bedOffset: 105 },
{ date: 'Oct 6', day: 'T', minutes: 430, deepMin: 80, remMin: 94, awakeMin: 22, score: 80, bedtime: '11:25 PM', wake: '6:40 AM', bedOffset: 85 },
{ date: 'Oct 7', day: 'W', minutes: 389, deepMin: 64, remMin: 80, awakeMin: 33, score: 69, bedtime: '12:12 AM', wake: '6:45 AM', bedOffset: 132 },
{ date: 'Oct 8', day: 'T', minutes: 436, deepMin: 82, remMin: 98, awakeMin: 21, score: 81, bedtime: '11:20 PM', wake: '6:40 AM', bedOffset: 80 },
{ date: 'Oct 9', day: 'F', minutes: 465, deepMin: 92, remMin: 107, awakeMin: 23, score: 88, bedtime: '10:55 PM', wake: '6:42 AM', bedOffset: 55 }];


export type StageSegment = {stage: 'awake' | 'rem' | 'light' | 'deep';start: number;dur: number;};

/** Last night's hypnogram (minutes from 10:55 PM). */
export const lastNightStages: StageSegment[] = [
{ stage: 'awake', start: 0, dur: 9 },
{ stage: 'light', start: 9, dur: 22 },
{ stage: 'deep', start: 31, dur: 38 },
{ stage: 'light', start: 69, dur: 30 },
{ stage: 'rem', start: 99, dur: 18 },
{ stage: 'light', start: 117, dur: 26 },
{ stage: 'deep', start: 143, dur: 32 },
{ stage: 'light', start: 175, dur: 34 },
{ stage: 'rem', start: 209, dur: 26 },
{ stage: 'awake', start: 235, dur: 5 },
{ stage: 'light', start: 240, dur: 40 },
{ stage: 'deep', start: 280, dur: 22 },
{ stage: 'rem', start: 302, dur: 30 },
{ stage: 'light', start: 332, dur: 52 },
{ stage: 'rem', start: 384, dur: 33 },
{ stage: 'awake', start: 417, dur: 9 },
{ stage: 'light', start: 426, dur: 35 },
{ stage: 'awake', start: 461, dur: 6 }];


export const formatMinutes = (m: number) => `${Math.floor(m / 60)}h ${String(Math.round(m % 60)).padStart(2, '0')}m`;