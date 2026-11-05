export type WeightEntry = {
  date: string;
  value: number;
  time?: string;
  note?: string;
  source: 'manual' | 'synced';
};

export type MeasurementKey = 'bodyFat' | 'muscleMass' | 'waist' | 'chest' | 'hip' | 'arm' | 'neck';

export type MeasurementEntry = {
  date: string;
  values: Partial<Record<MeasurementKey, number>>;
};