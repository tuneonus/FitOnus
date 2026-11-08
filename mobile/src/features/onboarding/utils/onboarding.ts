import type { ProfileSetup } from '../store/profileSetupStore';
import type { OnboardingStepId } from '../constants/steps';

export function isValidBirthday(day: number, month: number, year: number) {
  if (![day, month, year].every(Number.isInteger) || year < 1900) return false;
  const date = new Date(year, month - 1, day);
  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date <= new Date()
  );
}

export function canContinueOnboarding(step: OnboardingStepId, s: ProfileSetup) {
  if (step === 'personal') return s.name.trim().length > 0;
  if (step === 'dob') return isValidBirthday(s.dobDay, s.dobMonth, s.dobYear);
  if (step === 'height')
    return Number.isFinite(s.heightCm) && s.heightCm >= 120 && s.heightCm <= 230;
  if (step === 'weight')
    return Number.isFinite(s.weightKg) && s.weightKg >= 35 && s.weightKg <= 220;
  return true;
}

// Match the field names consumed by the profile onboarding endpoint.
export function getStepPayload(step: OnboardingStepId, s: ProfileSetup): Record<string, unknown> {
  switch (step) {
    case 'personal':
      return { name: s.name.trim(), sex: s.sex };
    case 'dob':
      return { dobYear: s.dobYear, dobMonth: s.dobMonth, dobDay: s.dobDay };
    case 'height':
      return { heightCm: s.heightCm };
    case 'weight':
      return { weightKg: s.weightKg };
    case 'experience':
      return { experience: s.experience };
    case 'goal':
      return { goal: s.goal };
    case 'workoutPreference':
      return { place: s.place, daysPerWeek: s.daysPerWeek, durationMin: s.durationMin };
    case 'equipment':
      return { equipment: s.equipment };
    case 'duration':
      return { durationMin: s.durationMin };
    case 'food':
      return { diet: s.diet, allergies: s.allergies, cuisines: s.cuisines };
    case 'health':
      return { healthAllowed: s.healthAllowed };
    case 'device':
      return { deviceConnected: s.deviceConnected };
    default:
      return {};
  }
}
