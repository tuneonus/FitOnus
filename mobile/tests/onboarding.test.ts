import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { isValidBirthday, canContinueOnboarding, getStepPayload } from '../src/features/onboarding/utils/onboarding.ts';
import { useProfileSetupStore } from '../src/features/onboarding/store/profileSetupStore.ts';
import { onboardingSteps, onboardingSections } from '../src/features/onboarding/constants/steps.ts';

afterEach(() => useProfileSetupStore.getState().reset());

describe('onboarding input validation', () => {
  it('accepts leap days only in leap years and rejects calendar rollovers', () => {
    assert.equal(isValidBirthday(29, 2, 2000), true);
    assert.equal(isValidBirthday(29, 2, 2001), false);
    assert.equal(isValidBirthday(31, 4, 2000), false);
    assert.equal(isValidBirthday(1, 13, 2000), false);
    assert.equal(isValidBirthday(0, 1, 2000), false);
    assert.equal(isValidBirthday(1, 1, new Date().getFullYear() + 1), false);
    assert.equal(isValidBirthday(NaN, 1, 2000), false);
  });
  it('blocks empty names and incomplete or out-of-range measurements', () => {
    const setup = useProfileSetupStore.getState();
    assert.equal(canContinueOnboarding('personal', { ...setup, name: '  ' }), false);
    assert.equal(canContinueOnboarding('personal', { ...setup, name: 'Sam' }), true);
    for (const heightCm of [NaN, 0, 119, 231]) assert.equal(canContinueOnboarding('height', { ...setup, heightCm }), false);
    for (const weightKg of [NaN, 0, 34, 221]) assert.equal(canContinueOnboarding('weight', { ...setup, weightKg }), false);
    assert.equal(canContinueOnboarding('height', { ...setup, heightCm: 120 }), true);
    assert.equal(canContinueOnboarding('weight', { ...setup, weightKg: 220 }), true);
  });
});

describe('onboarding persistence contract', () => {
  it('sends birthday, duration and eating preferences under backend-supported field names', () => {
    const setup = { ...useProfileSetupStore.getState(), name: '  Sam  ', dobYear: 1998, dobMonth: 11, dobDay: 20, durationMin: 60, diet: 'vegan' };
    assert.deepEqual(getStepPayload('personal', setup), { name: 'Sam', sex: 'unspecified' });
    assert.deepEqual(getStepPayload('dob', setup), { dobYear: 1998, dobMonth: 11, dobDay: 20 });
    assert.deepEqual(getStepPayload('duration', setup), { durationMin: 60 });
    assert.deepEqual(getStepPayload('workoutPreference', setup), { place: 'gym', daysPerWeek: 3, durationMin: 60 });
    assert.deepEqual(getStepPayload('food', setup), { diet: 'vegan', allergies: [], cuisines: [] });
    assert.deepEqual(getStepPayload('weight', setup), { weightKg: 70 });
  });
  it('saves health and watch preferences without claiming a live connection', () => {
    const setup = { ...useProfileSetupStore.getState(), healthAllowed: true, deviceConnected: false };
    assert.deepEqual(getStepPayload('health', setup), { healthAllowed: true });
    assert.deepEqual(getStepPayload('device', setup), { deviceConnected: false });
  });
  it('starts with a supported diet and makes bodyweight exclusive of equipment', () => {
    const store = useProfileSetupStore;
    assert.equal(store.getState().diet, 'none');
    store.getState().toggleInList('equipment', 'Dumbbells');
    store.getState().toggleInList('equipment', 'Bench');
    store.getState().toggleInList('equipment', 'None');
    assert.deepEqual(store.getState().equipment, ['None']);
    store.getState().toggleInList('equipment', 'Dumbbells');
    assert.deepEqual(store.getState().equipment, ['Dumbbells']);
    store.getState().toggleInList('equipment', 'Dumbbells');
    assert.deepEqual(store.getState().equipment, []);
  });
  it('keeps all 15 steps covered by the five sections in order', () => {
    assert.equal(onboardingSteps.length, 15);
    assert.deepEqual(onboardingSections.flatMap(section => [...section.steps]), onboardingSteps.map(step => step.id));
  });
});
