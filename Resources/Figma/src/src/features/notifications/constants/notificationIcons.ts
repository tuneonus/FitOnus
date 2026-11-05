import { BeefIcon, CupSodaIcon, DumbbellIcon, FileTextIcon, FlameIcon, FootprintsIcon, MoonIcon, TrophyIcon } from 'lucide-react';
import type { NotificationKind } from '../types/notification';

export const notificationIcons: Record<NotificationKind, typeof DumbbellIcon> = {
  workout: DumbbellIcon,
  walking: FootprintsIcon,
  water: CupSodaIcon,
  protein: BeefIcon,
  sleep: MoonIcon,
  achievement: TrophyIcon,
  streak: FlameIcon,
  report: FileTextIcon
};