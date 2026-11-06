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
  toggleInList: (
    key: 'equipment' | 'allergies' | 'cuisines',
    value: string
  ) => void;
  reset: () => void;
};

const initialSetup: ProfileSetup = {
  name: '',
  sex: 'unspecified',
  dobDay: 1,
  dobMonth: 1,
  dobYear: 2000,
  heightCm: 170,
  weightKg: 70,
  experience: 'beginner',
  goal: 'maintain',
  place: 'gym',
  daysPerWeek: 3,
  equipment: [],
  durationMin: 45,
  diet: 'omnivore',
  allergies: [],
  cuisines: [],
  healthAllowed: false,
  deviceConnected: false,
};

export const useProfileSetupStore = create<ProfileSetupState>((set, get) => ({
  ...initialSetup,
  update: (patch) => set(patch),
  toggleInList: (key, value) => {
    const list = get()[key];
    set({
      [key]: list.includes(value)
        ? list.filter((v) => v !== value)
        : [...list, value],
    } as Partial<ProfileSetup>);
  },
  reset: () => set(initialSetup),
}));

