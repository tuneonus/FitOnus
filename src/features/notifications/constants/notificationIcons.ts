import {
  Beef,
  CupSoda,
  Dumbbell,
  FileText,
  Flame,
  Footprints,
  Moon,
  Trophy,
} from 'lucide-react-native';
import type { NotificationKind } from '../types/notification';

export const notificationIcons: Record<NotificationKind, any> = {
  workout: Dumbbell,
  walking: Footprints,
  water: CupSoda,
  protein: Beef,
  sleep: Moon,
  achievement: Trophy,
  streak: Flame,
  report: FileText,
};
