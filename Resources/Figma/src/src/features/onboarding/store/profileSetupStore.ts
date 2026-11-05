import { create } from 'zustand';

export type ProfileSetup = {
  name: string;
  sex: 'male' | 'female' | 'unspecified';
  dobDay: number;
  dobMonth: number;
  dobYear: number;
  heightCm: number;
  weightKg: number;
  experience: string;
  goal: string;
  place: string;
  daysPerWeek: number;
  equipment: string[];
  durationMin: number;
  diet: string;
  allergies: string[];
  cuisines: string[];
  healthAllowed: boolean;
  deviceConnected: boolean;
};

type ProfileSetupState = ProfileSetup & {
  update: (patch: Partial<ProfileSetup>) => void;
  toggleInList: (key: 'equipment' | 'allergies' | 'cuisines', value: string) => void;
};

/** Onboarding answers. Also edited later from Profile → Preferences. */
export const useProfileSetupStore = create<ProfileSetupState>((set, get) => ({
  name: 'Aarav Mehta',
  sex: 'male',
  dobDay: 14,
  dobMonth: 3,
  dobYear: 1997,
  heightCm: 178,
  weightKg: 78.4,
  experience: 'intermediate',
  goal: 'lose',
  place: 'gym',
  daysPerWeek: 5,
  equipment: ['Barbell', 'Dumbbells', 'Cable machine', 'Bench', 'Pull-up bar'],
  durationMin: 60,
  diet: 'eggetarian',
  allergies: [],
  cuisines: ['North Indian', 'South Indian'],
  healthAllowed: false,
  deviceConnected: false,
  update: (patch) => set(patch),
  toggleInList: (key, value) => {
    const list = get()[key];
    set({ [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] } as Partial<ProfileSetup>);
  }
}));