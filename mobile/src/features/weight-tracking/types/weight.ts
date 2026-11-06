export type WeightEntry = {
  id?: string | undefined;
  date: string;
  value: number;
  time?: string | undefined;
  note?: string | undefined;
  source: 'manual' | 'synced';
};

export type MeasurementKey = 'bodyFat' | 'muscleMass' | 'waist' | 'chest' | 'hip' | 'arm' | 'neck';

export type MeasurementEntry = {
  id?: string | undefined;
  date: string;
  values: Partial<Record<MeasurementKey, number>>;
};