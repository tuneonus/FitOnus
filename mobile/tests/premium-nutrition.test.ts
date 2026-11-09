import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { manualFoodError } from '../src/features/nutrition/utils/manual-entry-validation';
const form = { name: 'My meal', kcal: '350', protein: '20', carbs: '40', fat: '12' };
describe('Manual meal entry validation', () => {
  it('accepts user-provided decimal nutrition without altering it', () => {
    assert.equal(manualFoodError({ ...form, kcal: '350.5', protein: '20.25' }), null);
  });
  it('requires a named food and a positive calorie entry', () => {
    assert.ok(manualFoodError({ ...form, name: ' ' }));
    assert.ok(manualFoodError({ ...form, kcal: '' }));
    assert.ok(manualFoodError({ ...form, kcal: '0' }));
  });
  it('blocks non-finite or nonnumeric calories before an offline log can be queued', () => {
    for (const kcal of ['Infinity', 'NaN', 'abc', '-12'])
      assert.ok(manualFoodError({ ...form, kcal }));
  });
  it('rejects invalid macro values rather than silently changing them to zero', () => {
    for (const key of ['protein', 'carbs', 'fat'])
      for (const value of ['-5', 'abc', 'Infinity'])
        assert.ok(manualFoodError({ ...form, [key]: value }));
  });
  it('preserves the explicitly documented blank/zero macro behavior', () => {
    assert.equal(manualFoodError({ ...form, protein: '', carbs: '0', fat: '' }), null);
  });
});
