import { BandageIcon, DumbbellIcon, HistoryIcon, MessagesSquareIcon, PillIcon, StethoscopeIcon, TargetIcon, UtensilsIcon } from 'lucide-react';
import type { MemoryCategory } from '../store/memoryStore';

export const memoryCategories: Record<MemoryCategory, {label: string;icon: typeof TargetIcon;}> = {
  goals: { label: 'Fitness goals', icon: TargetIcon },
  workout: { label: 'Workout preferences', icon: DumbbellIcon },
  food: { label: 'Food preferences', icon: UtensilsIcon },
  injuries: { label: 'Injuries', icon: BandageIcon },
  medical: { label: 'Medical context', icon: StethoscopeIcon },
  supplements: { label: 'Supplements', icon: PillIcon },
  progress: { label: 'Progress history', icon: HistoryIcon },
  conversations: { label: 'Conversation context', icon: MessagesSquareIcon }
};

export const memoryCategoryOrder = Object.keys(memoryCategories) as MemoryCategory[];