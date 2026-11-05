import type { MeasurementEntry, MeasurementKey, WeightEntry } from '../types/weight';

const septValues = [80.0, 79.9, 80.1, 79.8, 79.6, 79.7, 79.5, 79.6, 79.3, 79.4, 79.2, 79.0, 79.1, 78.9, 79.0, 78.8, 78.9, 78.6, 78.7, 78.5, 78.6, 78.4];
const dates = ['Sep 18', 'Sep 19', 'Sep 20', 'Sep 21', 'Sep 22', 'Sep 23', 'Sep 24', 'Sep 25', 'Sep 26', 'Sep 27', 'Sep 28', 'Sep 29', 'Sep 30', 'Oct 1', 'Oct 2', 'Oct 3', 'Oct 4', 'Oct 5', 'Oct 6', 'Oct 7', 'Oct 8', 'Oct 9'];

export const initialWeightEntries: WeightEntry[] = septValues.map((value, i) => ({
  date: dates[i],
  value,
  source: i % 3 === 0 ? 'synced' : 'manual',
  time: i === septValues.length - 1 ? '7:10 AM' : '7:0' + i % 9 + ' AM'
}));

/** Longer-range series for M/Y views. */
export const weightByMonth = [
{ label: 'Jan', value: 84.2 },
{ label: 'Feb', value: 83.5 },
{ label: 'Mar', value: 82.6 },
{ label: 'Apr', value: 82.1 },
{ label: 'May', value: 81.8 },
{ label: 'Jun', value: 81.9 },
{ label: 'Jul', value: 81.0 },
{ label: 'Aug', value: 80.4 },
{ label: 'Sep', value: 79.2 },
{ label: 'Oct', value: 78.4 }];


export const measurementMeta: {key: MeasurementKey;label: string;unit: string;goodWhenLower: boolean;}[] = [
{ key: 'bodyFat', label: 'Body fat', unit: '%', goodWhenLower: true },
{ key: 'muscleMass', label: 'Muscle mass', unit: 'kg', goodWhenLower: false },
{ key: 'waist', label: 'Waist', unit: 'cm', goodWhenLower: true },
{ key: 'chest', label: 'Chest', unit: 'cm', goodWhenLower: false },
{ key: 'hip', label: 'Hip', unit: 'cm', goodWhenLower: true },
{ key: 'arm', label: 'Arm', unit: 'cm', goodWhenLower: false },
{ key: 'neck', label: 'Neck', unit: 'cm', goodWhenLower: true }];


export const initialMeasurements: MeasurementEntry[] = [
{ date: 'Oct 4', values: { bodyFat: 18.6, muscleMass: 36.2, waist: 86.5, chest: 101, hip: 98, arm: 35.5, neck: 38 } },
{ date: 'Sep 20', values: { bodyFat: 19.4, muscleMass: 35.9, waist: 88, chest: 100.5, hip: 99, arm: 35, neck: 38.5 } },
{ date: 'Sep 6', values: { bodyFat: 20.1, muscleMass: 35.8, waist: 89.5, chest: 100, hip: 99.5, arm: 34.8, neck: 38.5 } }];