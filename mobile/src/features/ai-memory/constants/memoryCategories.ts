import {
  Bandage,
  Dumbbell,
  History,
  MessageSquare,
  Pill,
  Stethoscope,
  Target,
  Utensils,
} from 'lucide-react-native';
import type { MemoryCategory } from '../store/memoryStore';

export const memoryCategories: Record<
  MemoryCategory,
  { label: string; icon: any }
> = {
  goals: { label: 'Fitness goals', icon: Target },
  workout: { label: 'Workout preferences', icon: Dumbbell },
  food: { label: 'Food preferences', icon: Utensils },
  injuries: { label: 'Injuries', icon: Bandage },
  medical: { label: 'Medical context', icon: Stethoscope },
  supplements: { label: 'Supplements', icon: Pill },
  progress: { label: 'Progress history', icon: History },
  conversations: { label: 'Conversation context', icon: MessageSquare },
};

export const memoryCategoryOrder = Object.keys(
  memoryCategories
) as MemoryCategory[];
