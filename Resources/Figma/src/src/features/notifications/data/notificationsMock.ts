import type { AppNotification, NotificationPreference } from '../types/notification';

export const initialNotifications: AppNotification[] = [
{ id: 'n1', kind: 'workout', title: 'Push day is ready', body: 'Recovery 84 — Chest + Triceps is a go. Bench target: 72.5 kg × 4 sets.', time: '7:00 AM', group: 'Today', read: false, actionLabel: 'View workout', actionRoute: 'workoutPlan' },
{ id: 'n2', kind: 'water', title: 'Time for water', body: 'You’ve logged 500 ml so far. Aim for 750 ml before lunch.', time: '9:15 AM', group: 'Today', read: false },
{ id: 'n3', kind: 'streak', title: '4-day workout streak', body: 'Finish today’s session to make it 5 — your longest since August.', time: '6:30 AM', group: 'Today', read: true, actionLabel: 'See goals', actionRoute: 'goals' },
{ id: 'n4', kind: 'protein', title: 'Protein check-in', body: 'You hit 132 g yesterday — 18 g short of target. Add a shake after training.', time: '8:00 PM', group: 'Yesterday', read: true, actionLabel: 'Open nutrition', actionRoute: 'nutrition' },
{ id: 'n5', kind: 'achievement', title: 'New PR: Barbell Row', body: '70 kg × 8 — up 2.5 kg from last week.', time: '6:42 PM', group: 'Yesterday', read: true, actionLabel: 'View records', actionRoute: 'personalRecords' },
{ id: 'n6', kind: 'sleep', title: 'Wind down', body: 'Bedtime in 30 minutes keeps your schedule within 20 min of your average.', time: '10:30 PM', group: 'Yesterday', read: true, actionLabel: 'Sleep insights', actionRoute: 'sleep' },
{ id: 'n7', kind: 'report', title: 'Your weekly report is ready', body: 'Weight −0.4 kg, 5 workouts, sleep avg 7h 21m.', time: 'Sun 9:00 AM', group: 'Earlier', read: true, actionLabel: 'Read report', actionRoute: 'weeklyReport' },
{ id: 'n8', kind: 'walking', title: 'Quick walk?', body: 'You’ve been still for 90 minutes. A 10-minute walk adds ~1,100 steps.', time: 'Sat 3:10 PM', group: 'Earlier', read: true }];


export const notificationPreferenceDefaults: NotificationPreference[] = [
{ key: 'workout', label: 'Workout reminders', description: 'Morning plan and missed-session nudges', enabled: true, time: '7:00 AM' },
{ key: 'walking', label: 'Walking reminders', description: 'After 90 minutes of inactivity', enabled: true },
{ key: 'water', label: 'Water reminders', description: 'Every 2 hours, 8 AM – 8 PM', enabled: true },
{ key: 'protein', label: 'Protein reminders', description: 'Evening check if you’re under target', enabled: true, time: '8:00 PM' },
{ key: 'sleep', label: 'Sleep reminders', description: 'Wind-down before your usual bedtime', enabled: true, time: '10:30 PM' },
{ key: 'achievement', label: 'Achievements', description: 'PRs, goals, and milestones', enabled: true },
{ key: 'streak', label: 'Workout streaks', description: 'Streak saves and milestones', enabled: false },
{ key: 'report', label: 'AI reports', description: 'Weekly on Sunday, monthly on the 1st', enabled: true }];