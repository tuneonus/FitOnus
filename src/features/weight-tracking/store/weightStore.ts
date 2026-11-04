import { create } from 'zustand';
import { initialMeasurements, initialWeightEntries } from '../data/weightMock';
import type { MeasurementEntry, WeightEntry } from '../types/weight';

type WeightState = {
  entries: WeightEntry[];
  measurements: MeasurementEntry[];
  goalWeight: number;
  startWeight: number;
  addEntry: (value: number, note?: string) => WeightEntry | undefined;
  undoLast: (previous: WeightEntry | undefined) => void;
  addMeasurement: (entry: MeasurementEntry) => void;
};

export const useWeightStore = create<WeightState>((set, get) => ({
  entries: initialWeightEntries,
  measurements: initialMeasurements,
  goalWeight: 75,
  startWeight: 84.2,
  addEntry: (value, note) => {
    const entries = get().entries;
    const last = entries[entries.length - 1];
    const replacing = last?.date === 'Oct 9';
    const next: WeightEntry = { date: 'Oct 9', value, note, source: 'manual', time: 'Just now' };
    set({ entries: replacing ? [...entries.slice(0, -1), next] : [...entries, next] });
    return replacing ? last : undefined;
  },
  undoLast: (previous) => {
    const entries = get().entries.slice(0, -1);
    set({ entries: previous ? [...entries, previous] : entries });
  },
  addMeasurement: (entry) => set({ measurements: [entry, ...get().measurements] })
}));

export const useLatestWeight = () =>
useWeightStore((s) => s.entries[s.entries.length - 1]);