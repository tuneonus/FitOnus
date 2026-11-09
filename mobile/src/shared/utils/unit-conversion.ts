/**
 * Centralized Unit Conversion & Formatting Utilities for FitOnus
 *
 * Invariants:
 * 1. Database values are CANONICAL METRIC (kilograms, centimeters).
 * 2. Conversions to/from Imperial (pounds, feet/inches) are deterministic.
 * 3. Double-conversion is strictly avoided by always specifying source & target units.
 * 4. Invalid or nullish inputs return predictable fallbacks without throwing.
 */

export const KG_TO_LB = 2.20462262185;
export const LB_TO_KG = 0.45359237;
export const CM_TO_INCH = 0.3937007874;
export const INCH_TO_CM = 2.54;
export const INCHES_PER_FOOT = 12;

export type UnitSystem = 'metric' | 'imperial';

// ==========================================
// Weight Conversions
// ==========================================

/**
 * Converts kilograms to pounds.
 * Returns null if input is not a positive finite number.
 */
export function kgToLb(kg: number | null | undefined, precision = 1): number | null {
  if (kg === null || kg === undefined || !Number.isFinite(kg) || kg <= 0) {
    return null;
  }
  const lb = kg * KG_TO_LB;
  const factor = Math.pow(10, precision);
  return Math.round(lb * factor) / factor;
}

/**
 * Converts pounds to kilograms (canonical metric).
 * Returns null if input is not a positive finite number.
 */
export function lbToKg(lb: number | null | undefined, precision = 1): number | null {
  if (lb === null || lb === undefined || !Number.isFinite(lb) || lb <= 0) {
    return null;
  }
  const kg = lb * LB_TO_KG;
  const factor = Math.pow(10, precision);
  return Math.round(kg * factor) / factor;
}

/**
 * Formats a canonical metric weight (kg) for display in the target unit system.
 * Example:
 *   formatWeight(75, 'metric') => "75.0 kg"
 *   formatWeight(75, 'imperial') => "165.3 lb"
 *   formatWeight(null, 'metric') => "—"
 */
export function formatWeight(
  weightKg: number | null | undefined,
  unitSystem: UnitSystem,
  options?: {
    includeUnit?: boolean;
    precision?: number;
    fallback?: string;
  },
): string {
  const fallback = options?.fallback ?? '—';
  const includeUnit = options?.includeUnit ?? true;
  const precision = options?.precision ?? 1;

  if (weightKg === null || weightKg === undefined || !Number.isFinite(weightKg) || weightKg <= 0) {
    return fallback;
  }

  if (unitSystem === 'imperial') {
    const val = kgToLb(weightKg, precision);
    if (val === null) return fallback;
    const formatted = val.toFixed(precision);
    return includeUnit ? `${formatted} lb` : formatted;
  }

  const formatted = weightKg.toFixed(precision);
  return includeUnit ? `${formatted} kg` : formatted;
}

/**
 * Parses a user input weight in either metric (kg) or imperial (lb)
 * back to canonical kilograms for storage.
 */
export function parseWeightInputToKg(
  input: string | number | null | undefined,
  inputUnit: UnitSystem,
): number | null {
  if (input === null || input === undefined) return null;
  const val = typeof input === 'number' ? input : parseFloat(String(input).trim());
  if (!Number.isFinite(val) || val <= 0) return null;

  if (inputUnit === 'imperial') {
    return lbToKg(val, 2);
  }
  return Math.round(val * 100) / 100;
}

// ==========================================
// Height Conversions
// ==========================================

export interface FeetInches {
  feet: number;
  inches: number;
}

/**
 * Converts centimeters to fractional inches.
 */
export function cmToInches(cm: number | null | undefined): number | null {
  if (cm === null || cm === undefined || !Number.isFinite(cm) || cm <= 0) {
    return null;
  }
  return cm * CM_TO_INCH;
}

/**
 * Converts inches to centimeters (canonical metric).
 */
export function inchesToCm(inches: number | null | undefined, precision = 1): number | null {
  if (inches === null || inches === undefined || !Number.isFinite(inches) || inches <= 0) {
    return null;
  }
  const cm = inches * INCH_TO_CM;
  const factor = Math.pow(10, precision);
  return Math.round(cm * factor) / factor;
}

/**
 * Converts centimeters to feet and rounded inches.
 * Example: 178 cm => { feet: 5, inches: 10 }
 */
export function cmToFtIn(cm: number | null | undefined): FeetInches | null {
  const totalInches = cmToInches(cm);
  if (totalInches === null) return null;

  const roundedTotalInches = Math.round(totalInches);
  const feet = Math.floor(roundedTotalInches / INCHES_PER_FOOT);
  const inches = roundedTotalInches % INCHES_PER_FOOT;

  return { feet, inches };
}

/**
 * Converts feet and inches back to canonical centimeters.
 */
export function ftInToCm(
  feet: number | null | undefined,
  inches: number | null | undefined,
  precision = 1,
): number | null {
  const f = feet ?? 0;
  const i = inches ?? 0;
  if (!Number.isFinite(f) || !Number.isFinite(i) || (f <= 0 && i <= 0)) {
    return null;
  }
  const totalInches = f * INCHES_PER_FOOT + i;
  return inchesToCm(totalInches, precision);
}

/**
 * Formats a canonical metric height (cm) for display in the target unit system.
 * Example:
 *   formatHeight(178, 'metric') => "178 cm"
 *   formatHeight(178, 'imperial') => "5 ft 10 in"
 *   formatHeight(null, 'metric') => "—"
 */
export function formatHeight(
  heightCm: number | null | undefined,
  unitSystem: UnitSystem,
  options?: {
    includeUnit?: boolean;
    compactImperial?: boolean; // If true: 5' 10", else 5 ft 10 in
    fallback?: string;
  },
): string {
  const fallback = options?.fallback ?? '—';
  const includeUnit = options?.includeUnit ?? true;
  const compact = options?.compactImperial ?? false;

  if (heightCm === null || heightCm === undefined || !Number.isFinite(heightCm) || heightCm <= 0) {
    return fallback;
  }

  if (unitSystem === 'imperial') {
    const ftIn = cmToFtIn(heightCm);
    if (!ftIn) return fallback;
    if (compact) {
      return `${ftIn.feet}' ${ftIn.inches}"`;
    }
    return `${ftIn.feet} ft ${ftIn.inches} in`;
  }

  const rounded = Math.round(heightCm);
  return includeUnit ? `${rounded} cm` : String(rounded);
}

/**
 * Parses user height input back to canonical centimeters.
 */
export function parseHeightInputToCm(
  input: {
    cm?: number | string | null;
    feet?: number | string | null;
    inches?: number | string | null;
  },
  inputUnit: UnitSystem,
): number | null {
  if (inputUnit === 'metric') {
    if (input.cm === null || input.cm === undefined) return null;
    const val = typeof input.cm === 'number' ? input.cm : parseFloat(String(input.cm).trim());
    if (!Number.isFinite(val) || val <= 0) return null;
    return Math.round(val * 10) / 10;
  }

  const f = input.feet !== undefined && input.feet !== null ? Number(input.feet) : 0;
  const i = input.inches !== undefined && input.inches !== null ? Number(input.inches) : 0;
  return ftInToCm(f, i, 1);
}

// ==========================================
// BMI Calculations
// ==========================================

export type BmiCategory = 'Underweight' | 'Normal weight' | 'Overweight' | 'Obesity';

/**
 * Calculates Body Mass Index (BMI) using canonical metric units (weight in kg, height in cm).
 * Formula: weightKg / (heightM)^2
 * Returns rounded to 1 decimal place, or null if inputs are invalid.
 */
export function calculateBmi(
  weightKg: number | null | undefined,
  heightCm: number | null | undefined,
): number | null {
  if (
    weightKg === null ||
    weightKg === undefined ||
    !Number.isFinite(weightKg) ||
    weightKg <= 0 ||
    heightCm === null ||
    heightCm === undefined ||
    !Number.isFinite(heightCm) ||
    heightCm <= 0
  ) {
    return null;
  }
  const heightM = heightCm / 100;
  const bmi = weightKg / (heightM * heightM);
  return Number.isFinite(bmi) ? Math.round(bmi * 10) / 10 : null;
}

/**
 * Classifies BMI according to standard WHO clinical thresholds.
 */
export function getBmiCategory(bmi: number | null | undefined): BmiCategory | null {
  if (bmi === null || bmi === undefined || !Number.isFinite(bmi) || bmi <= 0) {
    return null;
  }
  if (bmi < 18.5) return 'Underweight';
  if (bmi < 25.0) return 'Normal weight';
  if (bmi < 30.0) return 'Overweight';
  return 'Obesity';
}

